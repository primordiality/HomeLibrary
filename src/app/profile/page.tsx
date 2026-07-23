'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface BorrowRow {
  id: string;
  copy_id: string;
  checkout_date: string;
  due_date: string | null;
  return_date: string | null;
}

interface BookInfo {
  id: string;
  title: string | null;
  cover_url: string | null;
}

type TabType = 'current' | 'past';

type ToastType = { id: number; message: string; type: 'success' | 'error' | 'info' };

export default function ProfilePage() {
  const { user, profile, loading: authLoading, updateProfile, updateEmail, changePassword } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentBorrows, setCurrentBorrows] = useState<BorrowRow[]>([]);
  const [pastBorrows, setPastBorrows] = useState<BorrowRow[]>([]);
  const [bookMap, setBookMap] = useState<Record<string, BookInfo>>({});
  const [copyToBook, setCopyToBook] = useState<Record<string, string>>({});
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>('current');

  // Toast management
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const toastIdRef = useState(0)[1];

  function toast(message: string, type: 'success' | 'error' | 'info') {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  // Profile name editing
  const [nameForm, setNameForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    name: profile?.name || '',
  });
  const [nameSaving, setNameSaving] = useState(false);

  // Email editing
  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  // Password editing
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    setNameForm({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      name: profile?.name || '',
    });
  }, [profile]);

  useEffect(() => {
    if (!user || authLoading) return;

    async function loadData() {
      setLoading(true);
      try {
        // Load active borrows
        const { data: activeData, error: activeErr } = await supabase
          .from('borrows')
          .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
          .eq('patron_user_id', user.id)
          .is('return_date', null)
          .order('due_date', { ascending: true });

        if (activeErr) throw new Error(activeErr.message);
        const activeList: BorrowRow[] = (activeData ?? []) as BorrowRow[];
        setCurrentBorrows(activeList);

        // Load past borrows
        const { data: pastData, error: pastErr } = await supabase
          .from('borrows')
          .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
          .eq('patron_user_id', user.id)
          .not('return_date', 'is', null)
          .order('return_date', { ascending: false })
          .limit(50);
        if (pastErr) throw new Error(pastErr.message);
        setPastBorrows((pastData ?? []) as BorrowRow[]);

        // Load copy → book mappings
        const allBorrows = [...activeList, ...((pastData ?? []) as BorrowRow[])];
        const copyIds = allBorrows.map((b) => b.copy_id);
        if (copyIds.length > 0) {
          const { data: copies } = await supabase
            .from('book_copies')
            .select('id, book_id')
            .in('id', copyIds);
          if (copies) {
            const map: Record<string, string> = {};
            for (const c of copies) {
              map[c.id] = c.book_id;
            }
            setCopyToBook(map);
          }
        }

        // Load book info
        const bookIds = [...new Set(Object.values(copyToBook))];
        if (bookIds.length > 0) {
          const { data: books } = await supabase
            .from('books')
            .select('id, title, cover_url')
            .in('id', bookIds);
          if (books) {
            const bMap: Record<string, BookInfo> = {};
            for (const b of books) {
              bMap[b.id] = b as BookInfo;
            }
            setBookMap(bMap);
          }
        }
      } catch (err: any) {
        console.error('Failed to load profile data:', err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, authLoading]);

  const today = new Date().toISOString().split('T')[0];

  function isOverdue(borrow: BorrowRow): boolean {
    return !!borrow.due_date && borrow.due_date < today;
  }

  function daysRemaining(dueDate: string | null): string {
    if (!dueDate) return 'No due date';
    const due = new Date(dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `${diff} day${diff !== 1 ? 's' : ''} remaining`;
  }

  function formatDisplayDate(isoStr: string): string {
    return new Date(isoStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function bookTitle(bookId: string): string {
    const book = bookMap[bookId];
    return book?.title || 'Untitled Book';
  }

  function coverUrl(bookId: string): string | null {
    const book = bookMap[bookId];
    return book?.cover_url || null;
  }

  async function handleReturn(borrowId: string) {
    setReturnLoading(true);
    setReturningId(borrowId);
    setReturnSuccess(null);
    try {
      const { error } = await supabase
        .from('borrows')
        .update({ return_date: new Date().toISOString() })
        .eq('id', borrowId);

      if (error) {
        alert('Failed to return book: ' + error.message);
      } else {
        setReturnSuccess('Book returned successfully!');
        setTimeout(() => setReturnSuccess(null), 3000);
        // Refresh borrows
        if (user) {
          const { data: activeData } = await supabase
            .from('borrows')
            .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
            .eq('patron_user_id', user.id)
            .is('return_date', null)
            .order('due_date', { ascending: true });
          setCurrentBorrows((activeData ?? []) as BorrowRow[]);
        }
      }
    } catch (err: any) {
      console.error('Return failed:', err.message);
    } finally {
      setReturnLoading(false);
      setReturningId(null);
    }
  }

  const displayName = profile?.name || profile?.first_name
    ? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    : profile?.email || 'User';

  // Name update handler
  async function handleNameUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!nameForm.first_name.trim() && !nameForm.last_name.trim()) {
      toast('Please enter a name.', 'error');
      return;
    }
    setNameSaving(true);
    try {
      const result = await updateProfile({
        name: nameForm.name || [nameForm.first_name, nameForm.last_name].filter(Boolean).join(' '),
        first_name: nameForm.first_name || undefined,
        last_name: nameForm.last_name || undefined,
      });
      if (result.error) {
        toast(result.error, 'error');
      } else {
        toast('Name updated successfully!', 'success');
      }
    } finally {
      setNameSaving(false);
    }
  }

  // Email update handler
  async function handleEmailUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast('Please enter a valid email address.', 'error');
      return;
    }
    setEmailSaving(true);
    try {
      const result = await updateEmail(newEmail.trim());
      if (result.error) {
        toast(result.error, 'error');
      } else {
        toast('Confirmation email sent. Check your inbox to complete the change.', 'info');
        setNewEmail('');
      }
    } finally {
      setEmailSaving(false);
    }
  }

  // Password update handler
  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw) {
      toast('Please enter your current password.', 'error');
      return;
    }
    if (newPw.length < 6) {
      toast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      toast('New passwords do not match.', 'error');
      return;
    }
    setPwSaving(true);
    try {
      const result = await changePassword(currentPw, newPw);
      if (result.error) {
        toast(result.error, 'error');
      } else {
        toast('Password changed. You will be signed out on other devices.', 'success');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } finally {
      setPwSaving(false);
    }
  }

  if (loading || authLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Profile</h1>
          <p className="mt-2 text-sm text-slate-500">Please sign in to view your profile.</p>
          <Link href="/signin" className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Sign In →
          </Link>
        </header>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg px-4 py-3 shadow-lg text-sm font-medium transition ${
              t.type === 'success'
                ? 'bg-green-600 text-white'
                : t.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Profile Info */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Name</dt>
            <dd className="text-slate-900 font-medium">{displayName}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900 font-medium">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="text-slate-900 font-medium capitalize">{profile?.role || '—'}</dd>
          </div>
        </div>
      </section>

      {/* Edit Name */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Edit Name</h2>
        <form onSubmit={handleNameUpdate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-slate-700 mb-1">
                First Name
              </label>
              <input
                id="first_name"
                type="text"
                value={nameForm.first_name}
                onChange={(e) => setNameForm((f) => ({ ...f, first_name: e.target.value, name: [e.target.value, f.last_name].filter(Boolean).join(' ') }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-slate-700 mb-1">
                Last Name
              </label>
              <input
                id="last_name"
                type="text"
                value={nameForm.last_name}
                onChange={(e) => setNameForm((f) => ({ ...f, last_name: e.target.value, name: [f.first_name, e.target.value].filter(Boolean).join(' ') }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="full_name"
              type="text"
              value={nameForm.name}
              onChange={(e) => setNameForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">Auto-filled from first & last name, or enter manually.</p>
          </div>
          <button
            type="submit"
            disabled={nameSaving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {nameSaving ? 'Saving...' : 'Update'}
          </button>
        </form>
      </section>

      {/* Change Email */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Change Email</h2>
        <form onSubmit={handleEmailUpdate} className="space-y-4">
          <div>
            <p className="text-sm text-slate-700 mb-1">
              Current email: <span className="font-medium">{user.email}</span>
            </p>
          </div>
          <div>
            <label htmlFor="new_email" className="block text-sm font-medium text-slate-700 mb-1">
              New Email
            </label>
            <input
              id="new_email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new.email@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
            <p className="mt-1 text-xs text-blue-700 bg-blue-50 rounded px-3 py-1.5">
              A confirmation email will be sent to the new address. Click the link in the email to complete the change.
            </p>
          </div>
          <button
            type="submit"
            disabled={emailSaving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {emailSaving ? 'Updating...' : 'Update Email'}
          </button>
        </form>
      </section>

      {/* Change Password */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="current_pw" className="block text-sm font-medium text-slate-700 mb-1">
                Current Password
              </label>
              <input
                id="current_pw"
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label htmlFor="new_pw" className="block text-sm font-medium text-slate-700 mb-1">
                New Password
              </label>
              <input
                id="new_pw"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">Must be at least 6 characters.</p>
            </div>
            <div>
              <label htmlFor="confirm_pw" className="block text-sm font-medium text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirm_pw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-1.5">
            This will sign you out on all other devices.
          </p>
          <button
            type="submit"
            disabled={pwSaving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {pwSaving ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </section>

      {/* Borrowing History */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Borrowing History</h2>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setActiveTab('current')}
              className={`px-4 py-1.5 text-sm font-medium transition ${
                activeTab === 'current'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Current Loans
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-4 py-1.5 text-sm font-medium transition ${
                activeTab === 'past'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Past Loans
            </button>
          </div>
        </div>

        {activeTab === 'current' ? (
          currentBorrows.length > 0 ? (
            <div className="space-y-3">
              {returnSuccess && (
                <p className="text-sm text-green-600 font-medium">{returnSuccess}</p>
              )}
              {currentBorrows.map((borrow) => {
                const bookId = copyToBook[borrow.copy_id];
                const overdue = isOverdue(borrow);
                const days = borrow.due_date ? daysRemaining(borrow.due_date) : 'No due date';
                return (
                  <div
                    key={borrow.id}
                    className={`flex items-center gap-4 rounded-lg border p-3 ${
                      overdue ? 'border-red-200 bg-red-50/50' : 'border-slate-200'
                    }`}
                  >
                    {/* Cover */}
                    {coverUrl(bookId || '') && (
                      <img
                        src={coverUrl(bookId || '')!}
                        alt=""
                        className="w-10 h-14 object-cover rounded shadow-sm"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/catalog/${bookId}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800 text-sm"
                      >
                        {bookTitle(bookId || '')}
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>Checked out {formatDisplayDate(borrow.checkout_date)}</span>
                        <span>•</span>
                        <span className={overdue ? 'text-red-500 font-medium' : ''}>
                          {borrow.due_date ? formatDisplayDate(borrow.due_date) : 'No due date'}
                        </span>
                      </div>
                      <div className={`text-xs mt-1 font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                        {days}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {overdue && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Overdue
                        </span>
                      )}
                      <button
                        onClick={() => handleReturn(borrow.id)}
                        disabled={returnLoading && returningId === borrow.id}
                        className={`text-xs font-medium rounded px-3 py-1.5 transition ${
                          overdue
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        } disabled:opacity-50`}
                      >
                        {returnLoading && returningId === borrow.id ? 'Returning...' : 'Return'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="text-sm font-medium text-slate-600 mb-2">No active loans</p>
              <p className="text-sm text-slate-500">
                You don't currently have any books checked out.
              </p>
              <Link
                href="/catalog"
                className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Browse Catalog
              </Link>
            </div>
          )
        ) : (
          /* Past Loans */
          pastBorrows.length > 0 ? (
            <div className="space-y-3">
              {pastBorrows.map((borrow) => {
                const bookId = copyToBook[borrow.copy_id];
                return (
                  <div key={borrow.id} className="flex items-center gap-4 rounded-lg border border-slate-200 p-3">
                    {/* Cover */}
                    {coverUrl(bookId || '') && (
                      <img
                        src={coverUrl(bookId || '')!}
                        alt=""
                        className="w-10 h-14 object-cover rounded shadow-sm"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/catalog/${bookId}`}
                        className="font-medium text-slate-900 text-sm"
                      >
                        {bookTitle(bookId || '')}
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>Checked out {formatDisplayDate(borrow.checkout_date)}</span>
                        <span>•</span>
                        <span>Returned {borrow.return_date ? formatDisplayDate(borrow.return_date) : '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="text-sm font-medium text-slate-600">No past borrows</p>
              <p className="text-sm text-slate-500">Your returned books will appear here.</p>
            </div>
          )
        )}
      </section>
    </div>
  );
}

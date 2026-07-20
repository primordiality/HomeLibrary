'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

export default function PatronsPage() {
  const [patrons, setPatrons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  // Stats
  const [totalPatrons, setTotalPatrons] = useState(0);
  const [activeCheckouts, setActiveCheckouts] = useState(0);
  const [onHoldCount, setOnHoldCount] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Per-patron stats (fetched after load)
  const [patronStats, setPatronStats] = useState<Record<string, { borrows: number; holds: number }>>({});

  useEffect(() => {
    loadPatrons();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  async function loadPatrons() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'patron')
        .order('name');
      if (error) throw new Error(error.message);
      if (data) setPatrons(data);
    } catch (err: any) {
      console.error('Failed to load patrons:', err);
      setErrorMessage(err.message || 'Failed to load patrons.');
      setTimeout(() => setErrorMessage(null), 4000);
    } finally { setLoading(false); }
  }

  async function loadStats() {
    try {
      const { count: active }: any = await supabase
        .from('borrows')
        .select('id', { count: 'exact', head: true })
        .is('return_date', null);
      if (active?.count !== undefined) setActiveCheckouts(active.count);

      const { count: holds }: any = await supabase
        .from('holds')
        .select('id', { count: 'exact', head: true });
      if (holds?.count !== undefined) setOnHoldCount(holds.count);
    } catch {
      console.error('Failed to load stats');
    }
  }

  async function loadPatronStats(patronIds: string[]) {
    if (patronIds.length === 0) return;
    try {
      // Active borrows per patron
      const { data: borrows }: any = await supabase
        .from('borrows')
        .select('patron_user_id')
        .is('return_date', null)
        .in('patron_user_id', patronIds);

      const { data: holds }: any = await supabase
        .from('holds')
        .select('patron_user_id')
        .in('patron_user_id', patronIds);

      const stats: Record<string, { borrows: number; holds: number }> = {};
      for (const id of patronIds) { stats[id] = { borrows: 0, holds: 0 }; }

      if (borrows) for (const b of borrows) { if (b.patron_user_id in stats) stats[b.patron_user_id].borrows++; }
      if (holds) for (const h of holds) { if (h.patron_user_id in stats) stats[h.patron_user_id].holds++; }

      setPatronStats(stats);
    } catch {
      console.error('Failed to load patron stats');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setOkMessage(null);

    if (!name.trim()) {
      setErrorMessage('Patron name is required.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert([{ name: name.trim(), email: email.trim() || null, role: 'patron' }])
        .select();

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error('Failed to create patron — no data returned.');

      setName('');
      setEmail('');
      setShowForm(false);
      await loadPatrons();
      await loadStats();
      setOkMessage('Patron created successfully!');
      setTimeout(() => setOkMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to create patron:', err);
      setErrorMessage(err.message || 'Failed to create patron.');
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }

  async function handleDelete(patronId: string, patronName: string) {
    if (!confirm('Are you sure you want to delete ' + patronName + '?')) return;

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', patronId);
      if (error) throw new Error(error.message);

      await loadPatrons();
      await loadStats();
      setOkMessage('Patron deleted.');
      setTimeout(() => setOkMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to delete patron:', err);
      setErrorMessage(err.message || 'Failed to delete patron.');
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }

  // Filter patrons by search
  const filteredPatrons = patrons.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) ||
           (p.email || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Patrons</h1>
        <p className="mt-2 text-sm text-slate-500">Manage patron accounts. Patrons can borrow from any library.</p>
      </header>

      {/* Messages */}
      {okMessage && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">
          {okMessage} <button onClick={() => setOkMessage(null)} className="underline ml-1">Dismiss</button>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <strong>Error: </strong>{errorMessage}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-slate-900">{totalPatrons}</p>
          <p className="text-sm text-slate-500">Total Patrons</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-indigo-600">{activeCheckouts}</p>
          <p className="text-sm text-slate-500">Active Check-outs</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-amber-600">{onHoldCount}</p>
          <p className="text-sm text-slate-500">On Hold</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-slate-900">{filteredPatrons.length}</p>
          <p className="text-sm text-slate-500">Showing</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full sm:w-72 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
          {showForm && (
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Cancel
            </button>
          )}
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 whitespace-nowrap"
          >
            + Add Patron
          </button>
        )}
      </div>

      {/* Create Patron Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">New Patron</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                Create Patron
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Patrons list */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : filteredPatrons.length > 0 ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="border-b bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-3 pl-4">Patron</th>
                <th className="py-3 hidden sm:table-cell">Email</th>
                <th className="py-3 hidden md:table-cell">Check-outs</th>
                <th className="py-3 hidden md:table-cell">On Hold</th>
                <th className="py-3 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPatrons.map(patron => {
                const stats = patronStats[patron.id] || { borrows: 0, holds: 0 };
                return (
                  <tr key={patron.id} className="hover:bg-slate-50">
                    <td className="py-3 pl-4 font-medium text-slate-900">{patron.name || patron.email || 'Unnamed'}</td>
                    <td className="py-3 hidden sm:table-cell text-slate-500">{patron.email || '—'}</td>
                    <td className="py-3 hidden md:table-cell text-center">
                      {stats.borrows > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{stats.borrows}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 hidden md:table-cell text-center">
                      {stats.holds > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">{stats.holds}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 text-right pr-4">
                      <Link
                        href={`/borrowings?patronId=${patron.id}`}
                        className="text-indigo-600 hover:text-indigo-800 mr-3 text-sm font-medium"
                      >
                        View All
                      </Link>
                      <button
                        onClick={() => handleDelete(patron.id, patron.name || 'this patron')}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          {searchQuery ? (
            <>
              <p className="text-sm font-medium text-slate-600 mb-2">No patrons found for "{searchQuery}".</p>
              <p className="text-sm text-slate-500">Try a different search.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-600 mb-2">No patrons yet.</p>
              <p className="text-sm text-slate-500">Add your first patron to track borrowings.</p>
            </>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link href="/borrowings" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          → Manage Borrowings
        </Link>
      </div>
    </div>
  );
}

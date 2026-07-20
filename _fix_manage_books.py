from pathlib import Path

p = Path("src/app/libraries/[id]/manage-books/page.tsx")
c = p.read_text()

# Find the empty-library branch and extract the "Add Book" button so it always shows.
old = '''        /* -- Add Book Button + Books List with Checkboxes -- */
        {books.length === 0 ? (
          <>
            <p className="text-sm text-slate-500">No books in this library yet.</p>
'''

new = '''        {/* -- Header: Add Book button always visible -- */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            + Add Book
          </button>
        </div>

        {/* -- Books List with Checkboxes -- */}
        {books.length === 0 ? (
          <>
            <p className="text-sm text-slate-500">No books in this library yet.</p>
'''

if old in c:
    c = c.replace(old, new)
    p.write_text(c)
    print("OK: Extracted 'Add Book' button to always-visible position")
else:
    print("FAIL: Could not find target block")
    # Show surrounding lines near books.length === 0
    idx = c.find("books.length === 0")
    if idx >= 0:
        print("Context:")
        print(repr(c[idx-50:idx+200]))

export default function ArticlesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Articles</h1>
      <p className="text-zinc-400 mb-8">Browse and manage all articles across your blogs.</p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500">No articles yet. Connect your database to get started.</p>
      </div>
    </div>
  );
}

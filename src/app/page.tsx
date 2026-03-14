export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
      <p className="text-zinc-400 mb-8">
        Overview of your blogs, articles, and content pipeline.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Blogs" value="—" />
        <StatCard title="Published Articles" value="—" />
        <StatCard title="Pipeline Items" value="—" />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <p className="text-sm text-zinc-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

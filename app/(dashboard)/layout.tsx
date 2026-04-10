import Sidebar from "@/components/sidebar";
import TopNavbar from "@/components/top-navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="sticky top-0 h-screen">
        <Sidebar />
      </aside>
      <div className="flex-1">
        <TopNavbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

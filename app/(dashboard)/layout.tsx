import Sidebar from "@/components/sidebar";
import TopNavbar from "@/components/top-navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen md:flex">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-red-300/20 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-amber-400/15 blur-3xl" />
      </div>
      <aside className="sticky top-0 z-30 h-screen">
        <Sidebar />
      </aside>
      <div className="relative z-10 flex-1">
        <TopNavbar />
        <main className="mx-auto w-full max-w-[1500px] p-6">{children}</main>
      </div>
    </div>
  );
}


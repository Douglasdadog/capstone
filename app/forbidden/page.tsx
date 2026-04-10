export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
      <section className="w-full rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-bold text-red-700">403 - Access Forbidden</h1>
        <p className="mt-2 text-red-600">
          Your account does not have permission to access this module.
        </p>
      </section>
    </main>
  );
}

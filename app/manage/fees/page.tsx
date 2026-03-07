import dynamic from "next/dynamic";

const ManageFeesClientPage = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <div className="muted">Loading...</div>
});

export default function ManageFeesPage() {
  return <ManageFeesClientPage />;
}

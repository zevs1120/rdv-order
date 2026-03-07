import dynamic from "next/dynamic";

const ManageHotClientPage = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <div className="muted">Loading...</div>
});

export default function ManageHotPage() {
  return <ManageHotClientPage />;
}

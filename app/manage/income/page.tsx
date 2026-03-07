"use client";

import dynamic from "next/dynamic";

const ManageIncomeClientPage = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <div className="muted">Loading...</div>
});

export default function ManageIncomePage() {
  return <ManageIncomeClientPage />;
}

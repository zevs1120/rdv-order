"use client";

import dynamic from "next/dynamic";

const ManageDevicesClientPage = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <div className="muted">Loading...</div>
});

export default function ManageDevicesPage() {
  return <ManageDevicesClientPage />;
}

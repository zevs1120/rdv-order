/** Closed is deliberately distinct from paid: cancellation can close an order. */
export function orderStatusLabel(status: string, cancelledAt: string | null | undefined, lang: "zh" | "en"): string {
  if (cancelledAt) return lang === "en" ? "Cancelled" : "已取消";
  const labels: Record<string, [string, string]> = {
    submitted: ["已提交", "Submitted"], preparing: ["制作中", "Preparing"],
    served: ["已上菜", "Served"], paid: ["已结账", "Paid"], closed: ["已关闭", "Closed"],
    cancelled: ["已取消", "Cancelled"], draft: ["待下单", "Draft"], merged: ["已并单", "Merged"]
  };
  return labels[status]?.[lang === "en" ? 1 : 0] ?? (lang === "en" ? "Unknown status" : "未知状态");
}

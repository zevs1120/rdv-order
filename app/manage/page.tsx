import { redirect } from "next/navigation";

export default function ManageIndexPage() {
  redirect("/manage/orders");
}

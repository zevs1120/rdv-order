import { start } from "workflow/api";
import { printDelivery } from "./workflow";

/** Persist the recovery owner before committing the task. An orphan run cannot
 * print a rolled-back task. This closes the DB commit -> background wake gap. */
export async function startPrintDelivery(id: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      start(printDelivery, [id]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("打印服务暂时繁忙，请重试")), 8000); })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

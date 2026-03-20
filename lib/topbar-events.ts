export const RDV_TOPBAR_STATE_EVENT = "rdv:topbar-state";
export const RDV_TOPBAR_ACTION_EVENT = "rdv:topbar-action";

export type TopbarStateDetail = {
  route: "tables" | "order";
  selectMode?: boolean;
  disableMultiSelect?: boolean;
};

export type TopbarActionDetail = {
  action: "tables-refresh" | "tables-toggle-select" | "order-open-actions";
};

export function dispatchTopbarState(detail: TopbarStateDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TopbarStateDetail>(RDV_TOPBAR_STATE_EVENT, { detail }));
}

export function dispatchTopbarAction(detail: TopbarActionDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TopbarActionDetail>(RDV_TOPBAR_ACTION_EVENT, { detail }));
}

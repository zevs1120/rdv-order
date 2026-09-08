export type CatalogClient = { query(sql: string, params?: any[]): Promise<any> };
export function refreshCatalog(client: CatalogClient): Promise<any[]>;
export function catalog(): any[];
export const breakfast: any[];
export const drinks: any;

/** Read every page through the public API; edited fixtures may sort into older history. */
export async function readAllSales(request) {
  const sales = [];
  for (let page = 1; ; page++) {
    const rows = await request(`sales?page=${page}`);
    sales.push(...rows);
    if (rows.length < 25) return sales;
  }
}

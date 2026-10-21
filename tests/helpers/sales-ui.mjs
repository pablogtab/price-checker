/** Open a compact sale record through its public button; leave an open record open. */
export async function openSaleDetails(row) {
  const button = row.getByRole("button", { name: "Ver venta", exact: true });
  if (await button.count()) await button.click();
}

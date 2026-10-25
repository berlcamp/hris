// PostgREST caps a response at 1000 rows. Pages through `build` until a short
// page comes back. `build` must apply a stable .order() so pages do not overlap.

const PAGE = 1000;

export async function selectAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

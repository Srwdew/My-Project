/** Which message the category field shows. A failed load and an empty type need different words: retry only helps the first. */
export function categoryNotice(loadFailed: boolean, loadedCount: number, countForType: number) {
  if (loadFailed) return 'load_failed' as const;
  return loadedCount > 0 && countForType === 0 ? ('none_for_type' as const) : null;
}

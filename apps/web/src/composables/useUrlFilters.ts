import { reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

/** Filter tersimpan di URL, jadi bisa dibagikan dan bertahan saat refresh (MP-02). */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const route = useRoute();
  const router = useRouter();
  const filters = reactive({ ...defaults }) as T;
  for (const k of Object.keys(defaults)) {
    const v = route.query[k];
    if (typeof v === "string") (filters as Record<string, string>)[k] = v;
  }
  watch(
    () => ({ ...filters }),
    (now) => {
      const query = Object.fromEntries(Object.entries(now).filter(([, v]) => v !== ""));
      router.replace({ query });
    },
  );
  /** Query string untuk API, memakai filter yang tidak kosong. */
  const toQuery = (extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ ...filters, ...extra }).filter(([, v]) => v !== "") as [string, string][]).toString();
  return { filters, toQuery };
}

import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchMe } from "./api.ts";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });
}

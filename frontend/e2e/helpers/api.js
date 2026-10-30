import { expect } from "@playwright/test";
import { apiBaseURL, loginViaApi } from "./auth.js";
import { withNetworkRetry } from "./retry.js";

const authHeaders = (auth) => ({
  Cookie: auth.cookie,
  "X-CSRF-Token": auth.csrfToken,
});

export const apiRequestAs = async (request, userKey, method, path, options = {}) => {
  const auth = await loginViaApi(request, userKey);
  const response = await withNetworkRetry(() => request.fetch(`${apiBaseURL}${path}`, {
    method,
    headers: {
      ...authHeaders(auth),
      ...(options.headers || {}),
    },
    data: options.data,
    params: options.params,
  }));
  return { response, auth };
};

export const apiJsonAs = async (request, userKey, method, path, options = {}) => {
  const { response, auth } = await apiRequestAs(request, userKey, method, path, options);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    expect(response.ok(), `${method} ${path} failed (${response.status()}): ${body}`).toBeTruthy();
  }
  return { data: await response.json(), auth, response };
};

export const apiGetAs = (request, userKey, path, options) =>
  apiJsonAs(request, userKey, "GET", path, options);

export const apiPostAs = (request, userKey, path, data, options = {}) =>
  apiJsonAs(request, userKey, "POST", path, { ...options, data });

export const apiPatchAs = (request, userKey, path, data, options = {}) =>
  apiJsonAs(request, userKey, "PATCH", path, { ...options, data });

export const apiPutAs = (request, userKey, path, data, options = {}) =>
  apiJsonAs(request, userKey, "PUT", path, { ...options, data });

export const apiDeleteAs = (request, userKey, path, options = {}) =>
  apiJsonAs(request, userKey, "DELETE", path, options);

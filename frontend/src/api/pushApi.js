import { httpClient } from "./httpClient";

export const pushApi = {
  getVapidPublicKey: () => httpClient.get("/push/vapid-public-key").then((response) => response.data),
  saveSubscription: (subscription) =>
    httpClient.post("/push/subscriptions", subscription).then((response) => response.data),
  deleteSubscription: (endpoint, config = {}) =>
    httpClient
      .delete("/push/subscriptions", { ...config, data: { endpoint } })
      .then((response) => response.data),
};

import axios from "axios";

let accessToken = null;
let refreshPromise = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const authRequest = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      authRequest.some((path) => originalRequest.url?.includes(path))
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = api.post("/auth/refresh")
          .then(({ data }) => {
            setAccessToken(data.accessToken);
            return data.accessToken;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newToken = await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      setAccessToken(null);
      window.dispatchEvent(new Event("auth:expired"));
      return Promise.reject(refreshError);
    }
  },
);

export default api;

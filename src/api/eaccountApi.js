import axios from "axios";
import { getAccessToken, autoLogin } from "./axiosConfig";

// API eaccount (tìm policy, chi tiết user) — tách instance riêng vì khác base URL với apiClient
// Khi đóng gói Electron (file://) không có Vite proxy → dùng URL trực tiếp
const isElectron = window.location.protocol === 'file:';

const eaccountClient = axios.create({
    baseURL: isElectron ? 'https://eaccount.kyta.fpt.com' : '/api-eaccount',
    headers: { 'Content-Type': 'application/json' }
});

eaccountClient.interceptors.request.use(config => {
    const token = getAccessToken();
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
});

// Token dùng chung với apiClient (cùng máy chủ xác thực eaccount) → khi 401 thì đăng nhập lại và thử 1 lần
eaccountClient.interceptors.response.use(
    res => res,
    async error => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                await autoLogin();
                const token = getAccessToken();
                if (token) {
                    originalRequest.headers['Authorization'] = `Bearer ${token}`;
                    return eaccountClient(originalRequest);
                }
            } catch (loginError) {
                return Promise.reject(loginError);
            }
        }
        return Promise.reject(error);
    }
);

export default eaccountClient;

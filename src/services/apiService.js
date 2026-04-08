import axios from "axios";
import { z } from "zod";
import { useNotifications } from "../composables/useNotifications";
import { getApiV1BaseUrl } from "../lib/runtimeConfig";
import * as schemas from "../schemas";
import {
	bootstrapVisitor,
	getOrCreateVisitorId,
	getVisitorToken,
	isVisitorTokenExpired,
} from "./visitorIdentity";

const { notifyError } = useNotifications();

/**
 * @typedef {Object} ApiRequestConfig
 * @property {boolean} [includeVisitor=true]
 * @property {number} [retryCount=3]
 * @property {number} [retryDelay=1000]
 */

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

const apiService = axios.create({
	baseURL: getApiV1BaseUrl(),
	timeout: DEFAULT_TIMEOUT,
	headers: {
		"Content-Type": "application/json",
	},
});

/**
 * Exponential backoff helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Request Interceptor: Attach headers
apiService.interceptors.request.use(
	async (config) => {
		const visitorId = getOrCreateVisitorId();
		const token = getVisitorToken();

		config.headers["X-Visitor-Id"] = visitorId;
		if (token) {
			config.headers["Authorization"] = `Bearer ${token}`;
			config.headers["X-Visitor-Token"] = token;
		}

		return config;
	},
	(error) => Promise.reject(error),
);

// Response Interceptor: Handle errors and retries
apiService.interceptors.response.use(
	(response) => response,
	async (error) => {
		const { config, response } = error;

		// 1. Handle 401 Unauthorized (Token Refresh)
		if (response?.status === 401 && !config._retry) {
			config._retry = true;
			try {
				const { visitorToken } = await bootstrapVisitor({ forceRefresh: true });
				if (visitorToken) {
					config.headers["Authorization"] = `Bearer ${visitorToken}`;
					config.headers["X-Visitor-Token"] = visitorToken;
					return apiService(config);
				}
			} catch (refreshError) {
				console.error("Token refresh failed:", refreshError);
			}
		}

		// 2. Exponential Backoff Retry for Network Errors or 5xx
		const isNetworkError = !response;
		const isServerError = response?.status >= 500;

		if (
			(isNetworkError || isServerError) &&
			(config._retryCount || 0) < MAX_RETRIES
		) {
			config._retryCount = (config._retryCount || 0) + 1;
			const delay = INITIAL_RETRY_DELAY * 2 ** (config._retryCount - 1);

			console.warn(`API Retry attempt ${config._retryCount} in ${delay}ms...`);
			await sleep(delay);
			return apiService(config);
		}

		// 3. Centralized Error Handling (Toasts)
		handleApiError(error);

		return Promise.reject(error);
	},
);

/**
 * Error handler with UI feedback
 */
function handleApiError(error) {
	let message = "เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย";
	let severity = "error";

	if (error.response) {
		const { status, data } = error.response;
		message =
			data?.message || data?.detail || `Error ${status}: ${error.message}`;

		// Some status codes might be warnings instead of errors
		if (status === 404) severity = "info";
		else if (status === 429) message = "คุณทำรายการบ่อยเกินไป กรุณารอสักครู่";
	} else if (error.request) {
		message = "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อของคุณ";
	}

	if (severity === "error") {
		notifyError(message);
	}
}

/**
 * @typedef {Object} ApiResponse
 * @property {any} data
 * @property {number} status
 * @property {string} statusText
 * @property {any} headers
 * @property {import('axios').InternalAxiosRequestConfig} config
 */

/**
 * Type-safe wrapper for API calls with optional Zod validation
 * @template T
 * @param {import('axios').AxiosRequestConfig & { schema?: import('zod').ZodSchema }} config
 * @returns {Promise<T>}
 */
export const request = async (config) => {
	const { schema, ...axiosConfig } = config;

	// Ensure headers object exists
	axiosConfig.headers = { ...axiosConfig.headers };

	// Manually apply request interceptor logic for axios instance
	// (Note: In a real axios instance, this happens automatically,
	// but we do it explicitly here to ensure headers are present even in mocks)
	const visitorId = getOrCreateVisitorId();
	const token = getVisitorToken();
	axiosConfig.headers["X-Visitor-Id"] = visitorId;
	if (token) {
		axiosConfig.headers["Authorization"] = `Bearer ${token}`;
		axiosConfig.headers["X-Visitor-Token"] = token;
	}

	const response = await apiService(axiosConfig);
	const data = response.data;

	if (schema) {
		try {
			return schema.parse(data);
		} catch (err) {
			console.error("[API Validation Error]", err);
			notifyError("ข้อมูลที่ได้รับไม่ถูกต้องตามรูปแบบที่กำหนด");
			throw err;
		}
	}

	return data;
};

/**
 * Centralized Schema Registry (Domain-driven)
 */
export const VenueSchema = schemas.VenueSchema;
export const DensitySchema = z.object({
	level: z.number(),
	label: z.string(),
});
export const VibeClaimSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	data: z.any().optional(),
});
export const RideEstimateSchema = schemas.RideEstimateSchema;
export const ReviewSchema = schemas.ReviewSchema;
export const TrafficStatusSchema = schemas.TrafficStatusSchema;
export const VisitorBootstrapSchema = schemas.VisitorBootstrapSchema;
export const UserProfileSchema = schemas.UserProfileSchema;

/**
 * Type-safe wrapper for API calls with optional Zod validation
 */
export const fetchVenues = () =>
	request({
		url: "/shops",
		method: "get",
		schema: z.array(VenueSchema),
	});

export default apiService;

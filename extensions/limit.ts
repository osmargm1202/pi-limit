import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isOrgmExtensionEnabled } from "./lib/orgm-extension-config.ts";
import {
	MINIMAX_CN_USAGE_URL,
	displayModel,
	fetchMinimaxUsageSnapshot,
	fetchUsageSnapshot,
	noLimitsDisplayModel,
	providerLimitKind,
	readCodexAuth,
	readMinimaxApiKey,
	unsupportedLimitsDisplayModel,
	type LimitDisplayModel,
	type LimitSnapshot,
} from "./lib/limit-usage.ts";

const LIMITS_MESSAGE_TYPE = "orgm-limits";

export function renderInlineLimitRows(model: LimitDisplayModel): string[] {
	if (model.fullRows.some((row) => /missing-auth|auth/i.test(row)) || model.fullText.includes("missing-auth") || model.error === "missing-auth") {
		return ["ChatGPT limits · no auth"];
	}
	if (model.error === "fetch-failed") {
		return ["ChatGPT limits · fetch failed"];
	}
	const rows = model.compactRows.length > 0 ? model.compactRows : model.fullRows;
	if (rows.length === 0) return ["ChatGPT limits · no disponible"];
	return [`ChatGPT limits · ${rows.join(" · ")}`];
}

async function refreshOnce(ctx: ExtensionContext): Promise<LimitDisplayModel> {
	const kind = providerLimitKind(ctx.model);
	if (kind === "unsupported") {
		return unsupportedLimitsDisplayModel(typeof ctx.model?.provider === "string" ? ctx.model.provider : undefined);
	}
	if (kind === "minimax") {
		const apiKey = readMinimaxApiKey();
		if (!apiKey) return displayModel(undefined, false, "missing-auth");
		try {
			const url = ctx.model?.provider === "minimax-cn" ? MINIMAX_CN_USAGE_URL : undefined;
			const snapshot = await fetchMinimaxUsageSnapshot(apiKey, fetch, url);
			if (snapshot.planType === "unlimited") return noLimitsDisplayModel("minimax");
			return displayModel(snapshot, false);
		} catch {
			return displayModel(undefined, false, "fetch-failed");
		}
	}
	const auth = readCodexAuth();
	if (!auth) return displayModel(undefined, false, "missing-auth");
	try {
		const snapshot: LimitSnapshot = await fetchUsageSnapshot(auth);
		return displayModel(snapshot, false);
	} catch {
		return displayModel(undefined, false, "fetch-failed");
	}
}

export default function (pi: ExtensionAPI) {
	if (!isOrgmExtensionEnabled("limit")) return;

	pi.registerMessageRenderer(LIMITS_MESSAGE_TYPE, (message, _options, theme) => {
		const rows = Array.isArray(message.details?.rows) ? message.details.rows.map(String) : [String(message.content ?? "")];
		return new Text(rows.map((row) => theme.fg("accent", row)).join("\n"), 0, 0);
	});

	pi.registerCommand("orgm-limits", {
		description: "Show active provider usage limits inline",
		handler: async (_args, ctx) => {
			const model = await refreshOnce(ctx);
			const rows = renderInlineLimitRows(model);
			pi.sendMessage({
				customType: LIMITS_MESSAGE_TYPE,
				content: rows.join("\n"),
				display: true,
				details: { rows },
			});
		},
	});
}

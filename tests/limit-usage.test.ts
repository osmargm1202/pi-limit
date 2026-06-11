import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	authFileCandidates,
	displayModel,
	fetchMinimaxUsageSnapshot,
	formatLimitBar,
	formatLimitMetric,
	formatLimitRows,
	formatLimitsRow,
	formatResetLabel,
	limitColorKind,
	noLimitsDisplayModel,
	parseMinimaxUsagePayload,
	parseUsagePayload,
	providerLimitKind,
	readCodexAuth,
	remainingPercent,
	unsupportedLimitsDisplayModel,
} from "../extensions/lib/limit-usage.ts";

assert.equal(remainingPercent(0), 100, "0 used means 100 remaining");
assert.equal(remainingPercent(8), 92, "8 used means 92 remaining");
assert.equal(remainingPercent(10), 90, "10 used means 90 remaining");
assert.equal(remainingPercent(100), 0, "100 used means 0 remaining");
assert.equal(remainingPercent(140), 0, "remaining clamps low");
assert.equal(remainingPercent(-20), 100, "remaining clamps high");
assert.equal(remainingPercent(undefined), undefined, "missing remains missing");

assert.equal(formatLimitBar(100), "[##########]");
assert.equal(formatLimitBar(92), "[#########-]");
assert.equal(formatLimitBar(90), "[#########-]");
assert.equal(formatLimitBar(0), "[----------]");
assert.equal(formatLimitBar(undefined), "[----------]");

assert.equal(formatLimitMetric("Codex 5H", 90), "Codex 5H [#########-]90%");
assert.equal(formatLimitMetric("Spark S", undefined), "Spark S [----------]--%");

const now = new Date("2026-06-07T07:15:00Z");
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

assert.equal(formatResetLabel(unix("2026-06-08T00:26:00Z"), now), "8:26PM", "same-day reset should omit date");
assert.equal(formatResetLabel(unix("2026-06-11T00:26:00Z"), now), "Jun 10, 2026 8:26PM", "different-day reset should include date");
assert.equal(formatResetLabel(unix("2026-06-07T22:00:00Z"), new Date("2026-06-07T23:00:00Z")), "6:00PM", "same Santo Domingo day should format reset in Santo Domingo time");
assert.equal(formatResetLabel(unix("2026-06-08T02:00:00Z"), new Date("2026-06-08T03:00:00Z")), "10:00PM", "same Santo Domingo day should ignore UTC day boundary");
assert.equal(formatResetLabel(undefined, now), "--", "missing reset should render placeholder");
assert.equal(limitColorKind(0), "error");
assert.equal(limitColorKind(1), "warning");
assert.equal(limitColorKind(29), "warning");
assert.equal(limitColorKind(30), "success");
assert.equal(limitColorKind(50), "success");
assert.equal(limitColorKind(51), "normal");
assert.equal(limitColorKind(100), "normal");
assert.equal(limitColorKind(undefined), "normal");

const payload = {
	plan_type: "pro",
	rate_limit: {
		primary_window: { used_percent: 10, reset_at: 1735401600, limit_window_seconds: 18000 },
		secondary_window: { used_percent: 8, reset_at: 1735920000, limit_window_seconds: 604800 },
	},
	additional_rate_limits: [
		{
			limit_name: "GPT-5.3-Codex-Spark",
			metered_feature: "codex_bengalfox",
			rate_limit: {
				primary_window: { used_percent: 50, reset_at: 1735401600, limit_window_seconds: 18000 },
				secondary_window: { used_percent: 20, reset_at: 1735920000, limit_window_seconds: 604800 },
			},
		},
	],
};

const parsed = parseUsagePayload(payload);
assert.equal(parsed.provider, "openai-codex");
assert.equal(parsed.planType, "pro");
assert.equal(parsed.codex.primary?.remainingPercent, 90);
assert.equal(parsed.codex.secondary?.remainingPercent, 92);
assert.equal(parsed.spark.primary?.remainingPercent, 50);
assert.equal(parsed.spark.secondary?.remainingPercent, 80);

const minimaxParsed = parseMinimaxUsagePayload({
	model_remains: [
		{
			model_name: "general",
			current_interval_remaining_percent: 88,
			current_weekly_remaining_percent: 61,
			remains_time: 1_800_000,
			weekly_remains_time: 86_400_000,
		},
		{
			model_name: "video",
			current_interval_remaining_percent: 50,
			current_weekly_remaining_percent: 75,
		},
	],
}, now.getTime());
assert.equal(minimaxParsed.provider, "minimax");
assert.equal(minimaxParsed.codex.limitId, "minimax-general");
assert.equal(minimaxParsed.codex.limitName, "general");
assert.equal(minimaxParsed.codex.primary?.remainingPercent, 88);
assert.equal(minimaxParsed.codex.secondary?.remainingPercent, 61);
assert.equal(minimaxParsed.codex.primary?.resetAt, Math.floor((now.getTime() + 1_800_000) / 1000));
assert.equal(minimaxParsed.spark.limitId, "minimax-video");
assert.equal(minimaxParsed.spark.limitName, "video");
assert.equal(minimaxParsed.spark.primary?.remainingPercent, 50);
assert.equal(minimaxParsed.spark.secondary?.remainingPercent, 75);
const minimaxCountFallback = parseMinimaxUsagePayload({
	model_remains: [{
		model_name: "MiniMax-M*",
		current_interval_total_count: 1500,
		current_interval_usage_count: 750,
		current_weekly_total_count: 5000,
		current_weekly_usage_count: 1250,
	}],
}, now.getTime());
assert.equal(minimaxCountFallback.codex.primary?.remainingPercent, 50, "MiniMax count fallback should derive remaining percent from interval count/total");
assert.equal(minimaxCountFallback.codex.secondary?.remainingPercent, 25, "MiniMax count fallback should derive remaining percent from weekly count/total");
assert.deepEqual(formatLimitRows(minimaxParsed, "full", now), [
	"general  5H [#########-]88% 3:45AM | S [######----]61% Jun 8, 2026 3:15AM",
	"video  5H [#####-----]50% -- | S [########--]75% --",
]);
assert.equal(
	formatLimitsRow(minimaxParsed, "full"),
	"general 5H [#########-]88% | general S [######----]61% | video 5H [#####-----]50% | video S [########--]75%",
);

assert.equal(
	formatLimitsRow(parsed, "full"),
	"Codex 5H [#########-]90% | Codex S [#########-]92% | Spark 5H [#####-----]50% | Spark S [########--]80%",
);
assert.equal(
	formatLimitsRow(parsed, "compact"),
	"C 5H [#########-]90% | C S [#########-]92% | SP 5H [#####-----]50% | SP S [########--]80%",
);

const resetPayload = {
	rate_limit: {
		primary_window: { used_percent: 18, reset_at: unix("2026-06-08T00:26:00Z"), limit_window_seconds: 18000 },
		secondary_window: { used_percent: 39, reset_at: unix("2026-06-11T00:26:00Z"), limit_window_seconds: 604800 },
	},
	additional_rate_limits: [
		{
			limit_name: "GPT-5.3-Codex-Spark",
			metered_feature: "codex_bengalfox",
			rate_limit: {
				primary_window: { used_percent: 60, reset_at: unix("2026-06-08T01:10:00Z"), limit_window_seconds: 18000 },
				secondary_window: { used_percent: 20, reset_at: unix("2026-06-12T05:05:00Z"), limit_window_seconds: 604800 },
			},
		},
	],
};
const resetParsed = parseUsagePayload(resetPayload);
assert.deepEqual(formatLimitRows(resetParsed, "full", now), [
	"Codex  5H [########--]82% 8:26PM | S [######----]61% Jun 10, 2026 8:26PM",
	"Spark  5H [####------]40% 9:10PM | S [########--]80% Jun 12, 2026 1:05AM",
]);
assert.deepEqual(formatLimitRows(resetParsed, "compact", now), [
	"C  5H [########--]82% 8:26PM | S [######----]61% Jun 10, 2026 8:26PM",
	"SP  5H [####------]40% 9:10PM | S [########--]80% Jun 12, 2026 1:05AM",
]);
assert.deepEqual(displayModel(resetParsed, false, undefined, now).fullRows, formatLimitRows(resetParsed, "full", now));

const exhaustedParsed = parseUsagePayload({
	rate_limit: {
		primary_window: { used_percent: 100, reset_at: unix("2026-06-08T00:26:00Z"), limit_window_seconds: 18000 },
		secondary_window: { used_percent: 100, reset_at: unix("2026-06-11T00:26:00Z"), limit_window_seconds: 604800 },
	},
	additional_rate_limits: [
		{
			limit_name: "GPT-5.3-Codex-Spark",
			metered_feature: "codex_bengalfox",
			rate_limit: {
				primary_window: { used_percent: 100, reset_at: unix("2026-06-08T01:10:00Z"), limit_window_seconds: 18000 },
				secondary_window: { used_percent: 20, reset_at: unix("2026-06-12T05:05:00Z"), limit_window_seconds: 604800 },
			},
		},
	],
});
assert.deepEqual(formatLimitRows(exhaustedParsed, "full", now), [
	"Codex  reposición semanal Jun 10, 2026 8:26PM",
	"Spark  reposición 5H 9:10PM",
], "exhausted rows should show selected replenishment window label and time, with weekly priority");
assert.deepEqual(formatLimitRows(exhaustedParsed, "compact", now), [
	"C  repo S Jun 10, 2026 8:26PM",
	"SP  repo 5H 9:10PM",
], "compact exhausted rows should show compact window label and selected replenishment time");
assert.deepEqual(formatLimitRows(parseUsagePayload({
	rate_limit: {
		primary_window: { used_percent: 100, reset_at: unix("2026-06-08T00:26:00Z"), limit_window_seconds: 18000 },
		secondary_window: { used_percent: 10, reset_at: unix("2026-06-11T00:26:00Z"), limit_window_seconds: 604800 },
	},
}), "full", now), [
	"Codex  reposición 5H 8:26PM",
	"Spark  5H [----------]--% -- | S [----------]--% --",
], "primary exhaustion should choose primary reset when weekly still has remaining quota");
assert.deepEqual(formatLimitRows(parseUsagePayload({
	rate_limit: {
		primary_window: { used_percent: 20, reset_at: unix("2026-06-08T00:26:00Z"), limit_window_seconds: 18000 },
		secondary_window: { used_percent: 100, limit_window_seconds: 604800 },
	},
}), "full", now), [
	"Codex  reposición semanal --",
	"Spark  5H [----------]--% -- | S [----------]--% --",
], "exhausted selected bucket without reset should render placeholder");

const noSpark = parseUsagePayload({
	rate_limit: {
		primary_window: { used_percent: 0 },
		secondary_window: { used_percent: 100 },
	},
});
assert.equal(
	formatLimitsRow(noSpark, "full"),
	"Codex 5H [##########]100% | Codex S [----------]0% | Spark 5H [----------]--% | Spark S [----------]--%",
);
assert.deepEqual(formatLimitRows(noSpark, "full", now), [
	"Codex  reposición semanal --",
	"Spark  5H [----------]--% -- | S [----------]--% --",
]);

assert.equal(providerLimitKind({ provider: "openai-codex", id: "gpt-5.3-codex", name: "GPT-5.3 Codex" }), "openai-codex");
assert.equal(providerLimitKind({ provider: "minimax", id: "MiniMax-M2.7", name: "MiniMax M2.7" }), "minimax");
assert.equal(providerLimitKind({ provider: "minimax-cn", id: "MiniMax-M2.7", name: "MiniMax M2.7" }), "minimax");
assert.equal(providerLimitKind({ provider: "anthropic", id: "claude", name: "Claude" }), "unsupported");
assert.equal(providerLimitKind(undefined), "unsupported");
assert.deepEqual(unsupportedLimitsDisplayModel("anthropic").fullRows, ["Limits: no disponible para anthropic"]);
assert.deepEqual(unsupportedLimitsDisplayModel().compactRows, ["Limits: no disponible"]);

// ── noLimitsDisplayModel (API-key / pay-per-token accounts) ──────────────────
assert.deepEqual(noLimitsDisplayModel().fullRows, ["Limits: sin limite (uso por API)"]);
assert.deepEqual(noLimitsDisplayModel().compactRows, ["Limits: sin limite"]);
assert.deepEqual(noLimitsDisplayModel("minimax").fullRows, ["Limits: sin limite para minimax (uso por API)"]);
assert.deepEqual(noLimitsDisplayModel("minimax").compactRows, ["Limits: sin limite"]);

// ── parseMinimaxUsagePayload — empty model_remains → planType: "unlimited" ──
const noLimitsParsed = parseMinimaxUsagePayload({ model_remains: [] }, now.getTime());
assert.equal(noLimitsParsed.provider, "minimax");
assert.equal(noLimitsParsed.planType, "unlimited", "empty model_remains should set planType to unlimited");
assert.equal(noLimitsParsed.codex.limitName, "general", "empty model_remains uses fallback name in bucket but planType marks as unlimited");

const noLimitsNull = parseMinimaxUsagePayload({ model_remains: null }, now.getTime());
assert.equal(noLimitsNull.planType, "unlimited", "null model_remains should set planType to unlimited");

const noLimitsMissing = parseMinimaxUsagePayload({}, now.getTime());
assert.equal(noLimitsMissing.planType, "unlimited", "missing model_remains should set planType to unlimited");

const withLimitsParsed = parseMinimaxUsagePayload({ model_remains: [{ model_name: "general", current_interval_remaining_percent: 80 }] }, now.getTime());
assert.equal(withLimitsParsed.planType, undefined, "non-empty model_remains should not set planType");

const minimaxRequests: { url: string; init?: RequestInit }[] = [];
const minimaxSnapshot = await fetchMinimaxUsageSnapshot("minimax-key", async (url, init) => {
	minimaxRequests.push({ url: String(url), init });
	return new Response(JSON.stringify({
		model_remains: [{
			model_name: "general",
			current_interval_remaining_percent: 91,
			current_weekly_remaining_percent: 82,
		}],
	}), { status: 200, headers: { "Content-Type": "application/json" } });
});
assert.equal(minimaxRequests[0]?.url, "https://api.minimax.io/v1/api/openplatform/coding_plan/remains");
assert.equal(minimaxRequests[0]?.init?.method, "GET");
assert.equal((minimaxRequests[0]?.init?.headers as Record<string, string>)?.Authorization, "Bearer minimax-key");
assert.equal(minimaxSnapshot.codex.primary?.remainingPercent, 91);

const tempDir = mkdtempSync(join(tmpdir(), "limit-auth-"));
try {
	const codeHome = join(tempDir, "codex-home");
	const fakeHome = join(tempDir, "home");
	mkdirSync(codeHome, { recursive: true });
	mkdirSync(join(fakeHome, ".config", "codex"), { recursive: true });
	mkdirSync(join(fakeHome, ".codex"), { recursive: true });

	assert.deepEqual(authFileCandidates({ CODEX_HOME: codeHome }, fakeHome), [
		join(codeHome, "auth.json"),
		join(fakeHome, ".config", "codex", "auth.json"),
		join(fakeHome, ".codex", "auth.json"),
	]);

	writeFileSync(join(fakeHome, ".codex", "auth.json"), JSON.stringify({
		tokens: {
			access_token: "fallback-access",
			refresh_token: "fallback-refresh",
			account_id: "fallback-account",
		},
	}), "utf8");
	writeFileSync(join(codeHome, "auth.json"), JSON.stringify({
		tokens: {
			access_token: "primary-access",
			refresh_token: "primary-refresh",
			account_id: "primary-account",
		},
	}), "utf8");

	const auth = readCodexAuth({ CODEX_HOME: codeHome }, fakeHome);
	assert.equal(auth?.tokens.accessToken, "primary-access");
	assert.equal(auth?.tokens.refreshToken, "primary-refresh");
	assert.equal(auth?.tokens.accountId, "primary-account");

	writeFileSync(join(codeHome, "auth.json"), "{not-json", "utf8");
	assert.equal(readCodexAuth({ CODEX_HOME: codeHome }, fakeHome)?.tokens.accessToken, "fallback-access", "invalid primary auth should fall back to next auth file");
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}

const limitExtensionSource = readFileSync(new URL("../extensions/limit.ts", import.meta.url), "utf8");
assert(limitExtensionSource.includes("isOrgmExtensionEnabled(\"limit\")"), "limit extension should be gated by orgm extension config");
assert(limitExtensionSource.includes("registerMessageRenderer"), "limit extension should render command output inline");
assert(limitExtensionSource.includes("pi.sendMessage"), "limit extension should send an inline command message");
assert(!limitExtensionSource.includes("setInterval"), "limit extension should not refresh on an interval");
assert(!limitExtensionSource.includes("session_start"), "limit extension should not refresh on session start");
assert(!limitExtensionSource.includes("model_select"), "limit extension should not refresh on model select");

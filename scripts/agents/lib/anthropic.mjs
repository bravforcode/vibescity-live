import { maxRiskLevel, normalizeRiskLevel, parseJsonLoose } from "./runtime.mjs";

export async function maybeGenerateAnthropicAdvice({ report, config }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      used: false,
      reason: "ANTHROPIC_API_KEY not set",
    };
  }

  try {
    const mod = await import("@anthropic-ai/sdk");
    const Anthropic = mod.default || mod.Anthropic;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || config.model?.name || "claude-3-5-sonnet-latest",
      max_tokens: Number(config.model?.max_tokens || 1200),
      temperature: Number(config.model?.temperature || 0),
      system:
        "You are the VibeCity signal-triager. Return compact JSON only with keys summary, recommended_action, risk_level. Do not add markdown.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              event_id: report.event_id,
              source: report.source,
              classification: report.classification,
              risk_level: report.risk_level,
              approval_required: report.approval_required,
              input_files: report.input_files,
              rerun_commands: report.rerun_commands,
              high_risk_matches: report.high_risk_matches,
              summary: report.signal_summary,
            },
            null,
            2,
          ),
        },
      ],
    });

    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    const parsed = parseJsonLoose(text);
    if (!parsed || typeof parsed !== "object") {
      return {
        used: false,
        reason: "Anthropic response was not valid JSON",
      };
    }

    return {
      used: true,
      summary: parsed.summary || null,
      recommended_action: parsed.recommended_action || null,
      risk_level: maxRiskLevel(report.risk_level, normalizeRiskLevel(parsed.risk_level)),
    };
  } catch (error) {
    return {
      used: false,
      reason: error?.message || String(error),
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey?: string;
  private readonly defaultModel: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    this.defaultModel = this.config.get<string>('OPENROUTER_MODEL', 'google/gemini-2.0-flash-001');
  }

  get isEnabled(): boolean {
    return !!this.apiKey && this.apiKey !== 'xxxxx' && this.apiKey !== '';
  }

  getStatus() {
    return {
      enabled: this.isEnabled,
      provider: 'openrouter',
      model: this.isEnabled ? this.defaultModel : 'disabled',
    };
  }

  /**
   * General chat completion via OpenRouter.
   * Falls back to null if the API is unavailable.
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | null> {
    if (!this.isEnabled) {
      this.logger.debug('AI service disabled — no valid OPENROUTER_API_KEY');
      return null;
    }

    const model = options?.model ?? this.defaultModel;
    const timeout = options?.timeout ?? 10000;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model,
          messages,
          max_tokens: options?.maxTokens ?? 256,
          temperature: options?.temperature ?? 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://higo.app',
            'X-Title': 'HiGo Abuja',
          },
          timeout,
        },
      );

      const choice = response.data?.choices?.[0];
      const content = choice?.message?.content?.trim() ?? null;

      if (content) {
        this.logger.debug(`AI response via ${model}: ${content.substring(0, 80)}...`);
      }

      return content;
    } catch (err) {
      const msg = err instanceof AxiosError ? err.message : String(err);
      this.logger.warn(`AI chat failed (${model}): ${msg}`);
      return null;
    }
  }

  /**
   * Structured JSON completion — asks model to return JSON.
   */
  async chatJson<T = unknown>(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<T | null> {
    const jsonMessages: ChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: 'Return your response as valid JSON only. No markdown, no explanation.',
      },
    ];

    const raw = await this.chat(jsonMessages, { ...options, temperature: 0.2 });
    if (!raw) return null;

    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      return JSON.parse(cleaned) as T;
    } catch {
      this.logger.warn(`AI returned non-JSON: ${raw.substring(0, 120)}`);
      return null;
    }
  }

  /**
   * Quick one-shot prompt — convenience for simple tasks.
   */
  async prompt(systemPrompt: string, userPrompt: string, options?: ChatOptions): Promise<string | null> {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options,
    );
  }
}

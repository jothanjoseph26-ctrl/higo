import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HceService {
  private readonly logger = new Logger(HceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assistant(payload: {
    text: string;
    language: string;
    facts?: Record<string, unknown>;
  }): Promise<string> {
    const { text, language, facts } = payload;

    // Try to get AI response via OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openrouter/free',
            temperature: 0.1,
            max_tokens: 350,
            messages: [
              {
                role: 'system',
                content: `You are HiGO Support Bot for a Nigerian ride-hailing platform in Abuja. Respond in ${language}. Be warm, practical, and SHORT (2-4 sentences). Return plain text only.`,
              },
              { role: 'user', content: text },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const data = await response.json();
          const answer = data.choices?.[0]?.message?.content;
          if (answer) return answer;
        }
      } catch (err) {
        this.logger.warn(`OpenRouter failed: ${err.message}`);
      }
    }

    // Fallback to template response
    return this.getFallbackResponse(language);
  }

  private getFallbackResponse(language: string): string {
    const responses: Record<string, string> = {
      en: "HiGO Support 🚐\n\nHow can we help you today?\n\nType 'help' for support options\nType 'register' to sign up\nType 'sos' for emergencies",
      ha: "HiGO Support 🚐\n\nTa yaya za mu taimake ku yau?\n\nRubuta 'help' don zaɓukan tallafi\nRubuta 'register' don yi rajista",
      yo: "HiGO Support 🚐\n\nBáwo ni a ṣe lè ran ọ lọwọ lọ́la?\n\nKọ 'help' fún àwọn àńfààní\nKọ 'register' láti kọ sílẹ̀",
      ig: "HiGO Support 🚐\n\nKedu otu anyị ga-esi nyere gị aka taa?\n\nDee 'help' maka nhọrọ enyemaka\nDee 'register' maka mbudata",
      pcm: "HiGO Support 🚐\n\nHow we fit help you today?\n\nType 'help' for support\nType 'register' to sign up",
    };
    return responses[language] || responses.en;
  }
}

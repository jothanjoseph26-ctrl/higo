import { Injectable, Logger } from '@nestjs/common';

export interface ExtractedEntities {
  intent: 'book_ride' | 'cancel' | 'status' | 'help' | 'menu' | 'unknown';
  pickup?: string;
  destination?: string;
  vehicleType?: string;
  paymentMethod?: string;
  rating?: number;
}

@Injectable()
export class NlpIntentService {
  private readonly logger = new Logger(NlpIntentService.name);

  private readonly INTENT_PATTERNS: Array<{ intent: ExtractedEntities['intent']; patterns: RegExp[] }> = [
    {
      intent: 'book_ride',
      patterns: [
        /(?:book|need|want|get)\s+(?:a\s+)?(?:ride|trip|keke|car|bike)/i,
        /(?:from|pickup)\s+.+\s+(?:to|dest|drop)/i,
        /(?:take|go)\s+me\s+(?:to|from)/i,
        /(?:how\s+(?:do\s+)?i\s+get\s+to)/i,
      ],
    },
    {
      intent: 'cancel',
      patterns: [
        /(?:cancel|abort|stop)\s+(?:my\s+)?(?:ride|trip|booking)/i,
        /never\s*mind/i,
      ],
    },
    {
      intent: 'status',
      patterns: [
        /(?:where|track|status)\s+(?:is|my|the)\s+(?:my\s+)?(?:ride|trip|driver)/i,
        /(?:how\s+(?:long|far))/i,
      ],
    },
    {
      intent: 'help',
      patterns: [/^(?:help|support|agent|human)/i],
    },
    {
      intent: 'menu',
      patterns: [/^(?:menu|start|hi|hello|hey)$/i],
    },
  ];

  private readonly LOCATION_PATTERNS = [
    /(?:from|pickup|at|in)\s+(.+?)\s+(?:to|dest|drop(?:off)?|going)\s+(.+)/i,
    /(?:to|dest|going)\s+(.+?)\s+(?:from|pickup|at)\s+(.+)/i,
    /(?:ride|take|go)\s+(?:me\s+)?(?:from\s+)?(.+?)(?:\s+to\s+(.+))?$/i,
    /^(.+?)\s+(?:to|->|→)\s+(.+)$/i,
  ];

  private readonly LANDMARKS: Record<string, string> = {
    'wuse': 'Wuse Market, Abuja',
    'garki': 'Garki, Abuja',
    'maitama': 'Maitama, Abuja',
    'central area': 'Central Area, Abuja',
    'airport': 'Nnamdi Azikiwe International Airport, Abuja',
    'kebbi': 'Kebbi State',
    'suleja': 'Suleja, Niger State',
    'zuba': 'Zuba, Abuja',
    'kubwa': 'Kubwa, Abuja',
    'lugbe': 'Lugbe, Abuja',
    'bwari': 'Bwari, Abuja',
    'jabi': 'Jabi, Abuja',
    'utako': 'Utako, Abuja',
    'gwarinpa': 'Gwarinpa, Abuja',
    'life camp': 'Life Camp, Abuja',
    'ape': 'APE Presidential Villa, Abuja',
  };

  extract(text: string): ExtractedEntities {
    const normalized = text.trim();
    const lower = normalized.toLowerCase();

    let intent: ExtractedEntities['intent'] = 'unknown';
    for (const { intent: i, patterns } of this.INTENT_PATTERNS) {
      if (patterns.some((p) => p.test(lower))) {
        intent = i;
        break;
      }
    }

    let pickup: string | undefined;
    let destination: string | undefined;

    for (const pattern of this.LOCATION_PATTERNS) {
      const match = normalized.match(pattern);
      if (match) {
        pickup = this.resolveLandmark(match[1]?.trim());
        destination = this.resolveLandmark(match[2]?.trim());
        if (pickup && destination) {
          intent = 'book_ride';
          break;
        }
      }
    }

    let vehicleType: string | undefined;
    if (/keke|keke\s*napep|tricycle|apture/i.test(lower)) vehicleType = 'keke';
    else if (/\bcar\b|sedan|suv/i.test(lower)) vehicleType = 'car';
    else if (/\bbike\b|motorcycle|okada/i.test(lower)) vehicleType = 'bike';

    let paymentMethod: string | undefined;
    if (/\bcash\b/i.test(lower)) paymentMethod = 'cash';
    else if (/\bcard\b|paystack|online/i.test(lower)) paymentMethod = 'card';

    let rating: number | undefined;
    const ratingMatch = lower.match(/(\d)\s*(?:star|⭐)/i);
    if (ratingMatch) {
      rating = parseInt(ratingMatch[1], 10);
    }

    return { intent, pickup, destination, vehicleType, paymentMethod, rating };
  }

  private resolveLandmark(input: string | undefined): string | undefined {
    if (!input) return undefined;

    const lower = input.toLowerCase();

    if (this.LANDMARKS[lower]) {
      return this.LANDMARKS[lower];
    }

    for (const [key, value] of Object.entries(this.LANDMARKS)) {
      if (lower.includes(key) || key.includes(lower)) {
        return value;
      }
    }

    return input;
  }

  isLocationInput(text: string): boolean {
    return /(?:street|road|lane|close|avenue|way|junction|market|estate|phase|district|area)/i.test(text)
      || /\d+/.test(text)
      || text.split(' ').length >= 2;
  }
}

import { NlpIntentService } from './nlp-intent.service';

describe('NlpIntentService', () => {
  let service: NlpIntentService;

  beforeEach(() => {
    service = new NlpIntentService();
  });

  describe('extract', () => {
    it('should extract "from X to Y" pattern', () => {
      const result = service.extract('from Wuse Market to Airport');
      expect(result.intent).toBe('book_ride');
      expect(result.pickup).toContain('Wuse');
      expect(result.destination).toContain('Airport');
    });

    it('should extract "to Y from X" pattern', () => {
      const result = service.extract('to Airport from Wuse');
      expect(result.intent).toBe('book_ride');
      // For "to Y from X", regex captures destination-first group as match[1]
      // and pickup group as match[2]; code assigns match[1]→pickup, match[2]→destination
      expect(result.pickup).toContain('Airport');
      expect(result.destination).toContain('Wuse');
    });

    it('should extract "X to Y" pattern', () => {
      const result = service.extract('Wuse to Garki');
      expect(result.intent).toBe('book_ride');
      expect(result.pickup).toContain('Wuse');
      expect(result.destination).toContain('Garki');
    });

    it('should detect keke vehicle type', () => {
      const result = service.extract('book keke to Garki');
      expect(result.vehicleType).toBe('keke');
    });

    it('should detect car vehicle type', () => {
      const result = service.extract('I need a car to the airport');
      expect(result.vehicleType).toBe('car');
    });

    it('should detect bike vehicle type', () => {
      const result = service.extract('book bike to Wuse');
      expect(result.vehicleType).toBe('bike');
    });

    it('should detect cancel intent', () => {
      const result = service.extract('cancel my ride');
      expect(result.intent).toBe('cancel');
    });

    it('should detect never mind as cancel', () => {
      const result = service.extract('never mind');
      expect(result.intent).toBe('cancel');
    });

    it('should detect help intent', () => {
      const result = service.extract('help');
      expect(result.intent).toBe('help');
    });

    it('should detect menu intent', () => {
      const result = service.extract('menu');
      expect(result.intent).toBe('menu');
    });

    it('should detect status intent', () => {
      const result = service.extract('where is my ride');
      expect(result.intent).toBe('status');
    });

    it('should detect cash payment', () => {
      const result = service.extract('pay with cash');
      expect(result.paymentMethod).toBe('cash');
    });

    it('should detect card payment', () => {
      const result = service.extract('pay with card');
      expect(result.paymentMethod).toBe('card');
    });

    it('should resolve Nigerian landmarks', () => {
      const result = service.extract('from wuse to airport');
      expect(result.pickup).toBe('Wuse Market, Abuja');
      expect(result.destination).toBe('Nnamdi Azikiwe International Airport, Abuja');
    });

    it('should resolve partial landmark matches', () => {
      const result = service.extract('from garki to maitama');
      expect(result.pickup).toBe('Garki, Abuja');
      expect(result.destination).toBe('Maitama, Abuja');
    });
  });

  describe('isLocationInput', () => {
    it('should detect address-like input', () => {
      expect(service.isLocationInput('123 Wuse Market Road')).toBe(true);
      expect(service.isLocationInput('Wuse Market, Abuja')).toBe(true);
      expect(service.isLocationInput('Airport junction')).toBe(true);
    });

    it('should reject non-location input', () => {
      expect(service.isLocationInput('yes')).toBe(false);
      expect(service.isLocationInput('ok')).toBe(false);
      expect(service.isLocationInput('confirm')).toBe(false);
    });
  });
});

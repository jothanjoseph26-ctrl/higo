import { NavigationService } from './navigation.service';

describe('NavigationService', () => {
  let service: NavigationService;

  beforeEach(() => {
    service = new NavigationService();
  });

  it('should build pickup navigation URL', () => {
    const url = service.toPickup(9.0579, 7.4951);
    expect(url).toContain('google.com/maps/dir/');
    expect(url).toContain('destination=9.0579');
    expect(url).toContain('7.4951');
    expect(url).toContain('dir_action=navigate');
  });

  it('should build destination navigation URL', () => {
    const url = service.toDestination(9.0600, 7.4800);
    expect(url).toContain('google.com/maps/dir/');
    expect(url).toContain('9.06');
    expect(url).toContain('7.48');
  });

  it('should build full route URL with origin and destination', () => {
    const url = service.fullRoute(9.0579, 7.4951, 9.0600, 7.4800);
    expect(url).toContain('origin=9.0579');
    expect(url).toContain('7.4951');
    expect(url).toContain('destination=9.06');
    expect(url).toContain('7.48');
  });

  it('should format trip summary with nav links', () => {
    const summary = service.tripSummaryWithNav({
      pickupAddress: 'Wuse Market',
      pickupLat: 9.0579,
      pickupLng: 7.4951,
      destAddress: 'Airport',
      destLat: 9.0600,
      destLng: 7.4800,
      fare: 2500,
      vehicleType: 'keke',
    });
    expect(summary).toContain('Wuse Market');
    expect(summary).toContain('Airport');
    expect(summary).toContain('google.com/maps');
  });
});

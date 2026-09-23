import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  const mockRedis = {
    setNx: jest.fn(),
    del: jest.fn(),
  };

  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService(mockRedis as any);
    jest.clearAllMocks();
  });

  it('should return false for new messages (not duplicate)', async () => {
    mockRedis.setNx.mockResolvedValue(true);
    const result = await service.isDuplicateMessage('msg_123');
    expect(result).toBe(false);
    expect(mockRedis.setNx).toHaveBeenCalledWith('wa:idempotent:msg_123', '1', expect.any(Number));
  });

  it('should return true for duplicate messages', async () => {
    mockRedis.setNx.mockResolvedValue(false);
    const result = await service.isDuplicateMessage('msg_123');
    expect(result).toBe(true);
  });

  it('should acquire action lock successfully', async () => {
    mockRedis.setNx.mockResolvedValue(true);
    const result = await service.acquireActionLock('ride:conv_123');
    expect(result).toBe(true);
    expect(mockRedis.setNx).toHaveBeenCalledWith('wa:lock:ride:conv_123', '1', expect.any(Number));
  });

  it('should fail to acquire lock if already held', async () => {
    mockRedis.setNx.mockResolvedValue(false);
    const result = await service.acquireActionLock('ride:conv_123');
    expect(result).toBe(false);
  });

  it('should generate ride creation key', () => {
    const key = service.rideCreationKey('conv_123');
    expect(key).toMatch(/^ride:conv_123:\d+$/);
  });

  it('should generate payment init key', () => {
    const key = service.paymentInitKey('trip_456', 250000);
    expect(key).toBe('payment:trip_456:250000');
  });
});

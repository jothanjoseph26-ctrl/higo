import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../firebase/firebase.service', () => ({
  FirebaseService: jest.fn().mockImplementation(() => ({
    isEnabled: jest.fn().mockReturnValue(false),
    messaging: { send: jest.fn() },
  })),
}));

describe('PushService', () => {
  let service: PushService;
  let firebase: { isEnabled: jest.Mock; messaging: { send: jest.Mock } };

  beforeEach(async () => {
    delete process.env.PUSH_ENABLED;

    firebase = {
      isEnabled: jest.fn().mockReturnValue(false),
      messaging: { send: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: FirebaseService, useValue: firebase },
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
            driver: { findUnique: jest.fn() },
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PushService);
    service.onModuleInit();
  });

  it('no-ops when push is disabled', async () => {
    await service.sendToToken('token-123', {
      title: 'Test',
      body: 'Body',
    });

    expect(firebase.messaging.send).not.toHaveBeenCalled();
    expect(service.isEnabled()).toBe(false);
  });
});
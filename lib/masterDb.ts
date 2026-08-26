import mongoose from 'mongoose';
import { StoreSchema, IStore } from '@/models/Store';
import { RegistrationSchema, IRegistration } from '@/models/Registration';
import { AdminSettingsSchema, IAdminSettings } from '@/models/AdminSettings';
import { SaasPlanSchema, ISaasPlan } from '@/models/SaasPlan';
import { TenantSubscriptionSchema, ITenantSubscription } from '@/models/TenantSubscription';
import { TenantUsageCounterSchema, ITenantUsageCounter } from '@/models/TenantUsageCounter';
// PlatformAdmin (Mongo) DIHAPUS 2026-08-17: admin panel sekarang full MySQL (saas-panel/).
// Endpoint /api/internal/saas/admins{,/login} + model Mongo-nya di-retire biar gak ada
// gudang kredensial admin kedua yang bisa jadi celah. Lihat memory saas-prelaunch-audit (B2).

const getMasterMongoUri = () => process.env.MASTER_MONGODB_URI?.trim();

interface MasterCache {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
  models: {
    Store: mongoose.Model<IStore> | null;
    Registration: mongoose.Model<IRegistration> | null;
    AdminSettings: mongoose.Model<IAdminSettings> | null;
    SaasPlan: mongoose.Model<ISaasPlan> | null;
    TenantSubscription: mongoose.Model<ITenantSubscription> | null;
    TenantUsageCounter: mongoose.Model<ITenantUsageCounter> | null;
  };
}

declare global {
  var masterMongoose: MasterCache | undefined;
}

let cached: MasterCache = global.masterMongoose || {
  conn: null,
  promise: null,
  models: {
    Store: null,
    Registration: null,
    AdminSettings: null,
    SaasPlan: null,
    TenantSubscription: null,
    TenantUsageCounter: null,
  },
};

if (!global.masterMongoose) {
  global.masterMongoose = cached;
}

async function connectToMasterDB(): Promise<mongoose.Connection> {
  const mongoUri = getMasterMongoUri();

  if (!mongoUri) {
    throw new Error(
      'Please define the MASTER_MONGODB_URI environment variable inside .env.local'
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      family: 4, // Force IPv4 to prevent ECONNREFUSED issues on Windows with Node 18+
    };

    const conn = mongoose.createConnection(mongoUri, opts);

    cached.promise = new Promise<mongoose.Connection>((resolve, reject) => {
      conn.once('open', () => resolve(conn));
      conn.on('error', (err) => reject(err));
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log('✅ Master MongoDB connected successfully');
  } catch (e: any) {
    cached.promise = null;
    cached.conn = null;
    console.error('❌ Master MongoDB connection failed:', e.message);
    throw e;
  }

  return cached.conn;
}

export async function getMasterModels() {
  const conn = await connectToMasterDB();

  if (!cached.models.Store) {
    cached.models.Store = conn.model<IStore>('Store', StoreSchema);
  }
  if (!cached.models.Registration) {
    cached.models.Registration = conn.model<IRegistration>('Registration', RegistrationSchema);
  }
  if (!cached.models.AdminSettings) {
    cached.models.AdminSettings = conn.model<IAdminSettings>('AdminSettings', AdminSettingsSchema);
  }
  if (!cached.models.SaasPlan) {
    cached.models.SaasPlan = conn.model<ISaasPlan>('SaasPlan', SaasPlanSchema);
  }
  if (!cached.models.TenantSubscription) {
    cached.models.TenantSubscription = conn.model<ITenantSubscription>('TenantSubscription', TenantSubscriptionSchema);
  }
  if (!cached.models.TenantUsageCounter) {
    cached.models.TenantUsageCounter = conn.model<ITenantUsageCounter>('TenantUsageCounter', TenantUsageCounterSchema);
  }

  return {
    Store: cached.models.Store,
    Registration: cached.models.Registration,
    AdminSettings: cached.models.AdminSettings,
    SaasPlan: cached.models.SaasPlan,
    TenantSubscription: cached.models.TenantSubscription,
    TenantUsageCounter: cached.models.TenantUsageCounter,
  };
}

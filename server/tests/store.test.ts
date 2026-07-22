import { MemoryStore } from '../src/store/memory'
import { storeContract } from './helpers/storeContract'

// The same contract runs against SupabaseStore in tests/integration/supabase.it.ts.
storeContract('MemoryStore', async () => ({ store: new MemoryStore(), learnerId: 'L1' }))

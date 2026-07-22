import { SqliteLearnerStore } from '../src/sqliteLearnerStore'
import { MemoryLearnerStore } from '../src/learnerStore'
import { learnerStoreContract } from './helpers/learnerStoreContract'

// The same contract runs against SupabaseLearnerStore in tests/integration/supabase.it.ts.
learnerStoreContract('SqliteLearnerStore', async () => ({ store: new SqliteLearnerStore(), learnerId: 'L1' }))
learnerStoreContract('MemoryLearnerStore', async () => ({ store: new MemoryLearnerStore(), learnerId: 'L1' }))

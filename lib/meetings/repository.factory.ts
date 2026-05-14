import type { MeetingRepository } from "./repository";
import { InMemoryMeetingRepository } from "./repository.memory";
import { SupabaseMeetingRepository } from "./repository.supabase";
import { DualWriteMeetingRepository } from "./repository.dual";
import { hasSupabaseServiceClientConfig } from "../supabaseServer";

let cachedRepository: MeetingRepository | null = null;

export function getMeetingRepository(): MeetingRepository {
  if (cachedRepository) {
    return cachedRepository;
  }

  const memoryRepo = new InMemoryMeetingRepository();
  const dbEnabled = process.env.MEETING_DB_ENABLED === "1";

  if (!dbEnabled || !hasSupabaseServiceClientConfig()) {
    cachedRepository = memoryRepo;
    return cachedRepository;
  }

  try {
    const supabaseRepo = new SupabaseMeetingRepository();
    cachedRepository = new DualWriteMeetingRepository(supabaseRepo, memoryRepo);
    return cachedRepository;
  } catch {
    cachedRepository = memoryRepo;
    return cachedRepository;
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OnboardingProgress {
  idempotencyKey: string;
  organizationId?: string;
}

export interface CreatedOrganization {
  id: string;
}

export function loadOrCreateOnboardingProgress(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  userId: string,
): OnboardingProgress {
  const key = storageKey(userId);
  try {
    const stored = JSON.parse(storage.getItem(key) ?? '') as Partial<OnboardingProgress>;
    if (typeof stored.idempotencyKey === 'string' && UUID_V4.test(stored.idempotencyKey)) {
      return {
        idempotencyKey: stored.idempotencyKey,
        ...(typeof stored.organizationId === 'string' && UUID_V4.test(stored.organizationId)
          ? { organizationId: stored.organizationId }
          : {}),
      };
    }
  } catch {
    // Replace malformed local progress with a new resumable request.
  }

  const progress = { idempotencyKey: crypto.randomUUID() };
  storage.setItem(key, JSON.stringify(progress));
  return progress;
}

export function saveOnboardingProgress(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  progress: OnboardingProgress,
): void {
  storage.setItem(storageKey(userId), JSON.stringify(progress));
}

export function clearOnboardingProgress(
  storage: Pick<Storage, 'removeItem'>,
  userId: string,
): void {
  storage.removeItem(storageKey(userId));
}

export async function resumeOnboardingOrganization(input: {
  progress: OnboardingProgress;
  createOrganization: (idempotencyKey: string) => Promise<CreatedOrganization>;
  saveProgress: (progress: OnboardingProgress) => void;
  switchOrganization: (organizationId: string) => Promise<void>;
}): Promise<string> {
  let organizationId = input.progress.organizationId;
  if (!organizationId) {
    const organization = await input.createOrganization(input.progress.idempotencyKey);
    organizationId = organization.id;
    input.saveProgress({ ...input.progress, organizationId });
  }
  await input.switchOrganization(organizationId);
  return organizationId;
}

function storageKey(userId: string): string {
  return `abonten.onboarding.${userId}`;
}

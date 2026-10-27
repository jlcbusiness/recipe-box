const testEmailSuffix = '@example.test';

export function findLocalOwner(users, primaryOwnerEmail) {
  const syntheticOwner = users.find(
    (user) => user.email?.toLocaleLowerCase() === primaryOwnerEmail.toLocaleLowerCase(),
  );
  if (syntheticOwner) return syntheticOwner;

  const existingOwners = users.filter(
    (user) =>
      typeof user.email === 'string' && !user.email.toLocaleLowerCase().endsWith(testEmailSuffix),
  );
  if (existingOwners.length > 1) {
    throw new Error(
      'Multiple non-test local accounts exist. The loader cannot choose an owner; leave one local owner or provision the dedicated fixture owner.',
    );
  }
  return existingOwners[0] ?? null;
}

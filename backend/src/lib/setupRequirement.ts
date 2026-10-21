// A previous invitation is not completion. Admin accounts keep their own landing flow.
export function requiresSetup(user:{role:string;setupCompletedAt:Date|string|null}):boolean {
  return user.role==='USER' && !user.setupCompletedAt;
}

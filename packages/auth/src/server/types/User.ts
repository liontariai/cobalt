export function primary_email() {
    const { emails } = $$root.User(this);

    return emails.find((e) => e.verified && e.primary);
}

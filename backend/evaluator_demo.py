"""Public evaluator identities for the SIH demonstration environment.

These credentials are intentionally published for judges. They must never be
reused for the private owner account or any real municipal deployment.
"""

DEMO_ACCOUNTS = {
    "Admin": {
        "name": "GreenPulse Demo Administrator",
        "email": "judge-admin@greenpulse.example",
        "password_hash": "scrypt$26ab1689adfda284c62d88f739c1b60e$9b148dd7afec1f22bdd3b4d083a51c023e1fc4e2ec6dc0250b18087cea78076a7973ab9a1e057f2a87398038efb3d8243b08b7dbbb7a091e23eb39f4d223206a",
    },
    "Driver": {
        "name": "GreenPulse Demo Field Worker",
        "email": "judge-worker@greenpulse.example",
        "password_hash": "scrypt$57f0b0d07fe23592547aa25e289bcff4$817ae303dab007a79fcc700b9b3a6db76c86cde0485c144c08fd9ebfe526633041040b4af048ad1c7c3b564da35f3c820a9bdeec807e52fa2e627f0eb028d2a4",
    },
    "Citizen": {
        "name": "GreenPulse Demo Citizen",
        "email": "judge-citizen@greenpulse.example",
        "password_hash": "scrypt$36e8657d81dc5357e3d9702b28bb0779$2718a97a810953287ad47e5bce2d7acd469c524c64ecea1299976911100ec382b8c45c94ef170da9f9d577fcbfb6d10696d86ea4c38f1f51fb7302e496f5da34",
    },
}

DEMO_EMAILS = {account["email"] for account in DEMO_ACCOUNTS.values()}


def is_evaluator_account(user, role=None):
    if not user or getattr(user, "email", "") not in DEMO_EMAILS:
        return False
    return role is None or getattr(user, "role", None) == role


def demo_email(role):
    return DEMO_ACCOUNTS[role]["email"]

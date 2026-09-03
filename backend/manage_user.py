"""Trusted operator console only. No public staff-registration endpoint."""
import argparse
import getpass
from sqlalchemy.exc import IntegrityError
import models
from database import engine, SessionLocal
from routers.auth import Registration
from security import hash_password, next_user_id

def main():
    parser = argparse.ArgumentParser(description="Create a GreenPulse staff account locally")
    parser.add_argument("--role", choices=["Admin", "Driver"], required=True)
    args = parser.parse_args()
    name = input("Full name: ")
    email = input("Email: ")
    password = getpass.getpass("Password (at least 12 characters): ")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords did not match.")
    try:
        body = Registration(name=name, email=email, password=password)
    except ValueError:
        raise SystemExit("Invalid details. Use a valid email and a 12-128 character password.")
    models.Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(models.User(id=next_user_id(db), name=body.name, email=body.email,
                           password_hash=hash_password(body.password), role=args.role, green_credits=0))
        try:
            db.commit()
        except IntegrityError:
            raise SystemExit("Account already exists or concurrent registration occurred. No account changed.")
    print("Staff account created. No credentials were written to source code.")

if __name__ == "__main__":
    main()

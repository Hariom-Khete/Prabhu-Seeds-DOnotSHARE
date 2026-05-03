"""Add surname, email, password_hash to users

Revision ID: 007
Revises: 006
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('surname', sa.String(), nullable=True))
    op.add_column('users', sa.Column('email', sa.String(), nullable=True))
    op.add_column('users', sa.Column('password_hash', sa.String(), nullable=True))
    op.create_index('ix_users_email', 'users', ['email'], unique=True)


def downgrade():
    op.drop_index('ix_users_email', table_name='users')
    op.drop_column('users', 'password_hash')
    op.drop_column('users', 'email')
    op.drop_column('users', 'surname')

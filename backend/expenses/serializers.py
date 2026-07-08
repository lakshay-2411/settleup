from decimal import Decimal, InvalidOperation

from rest_framework import serializers

from groups.models import Person
from groups.serializers import PersonSerializer

from .models import Expense, ExpenseShare, Settlement, SplitType


class ExpenseShareSerializer(serializers.ModelSerializer):
    person = PersonSerializer(read_only=True)

    class Meta:
        model = ExpenseShare
        fields = ["id", "person", "share_amount_inr", "weight"]


class ExpenseSerializer(serializers.ModelSerializer):
    payer = PersonSerializer(read_only=True)
    shares = ExpenseShareSerializer(many=True, read_only=True)

    # Write-side: names resolved against the group's roster in the view.
    payer_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    participants = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )
    split_details = serializers.DictField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Expense
        fields = [
            "id", "group", "date", "description",
            "payer", "payer_name",
            "original_amount", "original_currency",
            "amount_inr", "fx_rate", "fx_rate_date",
            "split_type", "split_raw", "notes", "status", "is_refund",
            "source_row_number", "shares",
            "participants", "split_details",
        ]
        read_only_fields = [
            "group", "amount_inr", "fx_rate", "fx_rate_date", "split_raw", "shares",
        ]

    def validate_split_details(self, value):
        if value is None:
            return value
        try:
            return {k: Decimal(str(v)) for k, v in value.items()}
        except (InvalidOperation, TypeError):
            raise serializers.ValidationError("split_details values must be numbers")

    def validate(self, attrs):
        split_type = attrs.get("split_type", getattr(self.instance, "split_type", None))
        details = attrs.get("split_details")
        participants = attrs.get("participants")
        if split_type != SplitType.EQUAL and not details and not self.instance:
            raise serializers.ValidationError(
                {"split_details": f"required for split_type={split_type}"}
            )
        if not self.instance and not participants:
            raise serializers.ValidationError({"participants": "required"})
        return attrs


class SettlementSerializer(serializers.ModelSerializer):
    from_person = PersonSerializer(read_only=True)
    to_person = PersonSerializer(read_only=True)
    from_person_name = serializers.CharField(write_only=True)
    to_person_name = serializers.CharField(write_only=True)

    class Meta:
        model = Settlement
        fields = [
            "id", "group", "date",
            "from_person", "to_person", "from_person_name", "to_person_name",
            "original_amount", "original_currency", "amount_inr", "fx_rate",
            "notes", "source_row_number",
        ]
        read_only_fields = ["group", "amount_inr", "fx_rate"]

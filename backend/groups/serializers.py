from rest_framework import serializers

from .models import Group, Membership, Person


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ["id", "name", "display_name", "is_guest"]


class MembershipSerializer(serializers.ModelSerializer):
    person = PersonSerializer(read_only=True)
    # Accept a person by name on write; created if unknown (guests, new flatmates).
    person_name = serializers.CharField(write_only=True)

    class Meta:
        model = Membership
        fields = ["id", "person", "person_name", "joined_on", "left_on", "role"]

    def validate(self, attrs):
        joined = attrs.get("joined_on", getattr(self.instance, "joined_on", None))
        left = attrs.get("left_on", getattr(self.instance, "left_on", None))
        if joined and left and left < joined:
            raise serializers.ValidationError("left_on cannot be before joined_on.")
        return attrs

    def create(self, validated_data):
        name = validated_data.pop("person_name").strip()
        person, _ = Person.objects.get_or_create(
            name=name, defaults={"is_guest": validated_data.get("role") == "guest"}
        )
        return Membership.objects.create(person=person, **validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("person_name", None)  # person identity is immutable here
        return super().update(instance, validated_data)


class GroupSerializer(serializers.ModelSerializer):
    memberships = MembershipSerializer(many=True, read_only=True)

    class Meta:
        model = Group
        fields = ["id", "name", "base_currency", "created_at", "memberships"]

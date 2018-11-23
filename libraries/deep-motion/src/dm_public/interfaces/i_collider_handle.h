#pragma once
#include "dm_public/non_copyable.h"
#include "dm_public/types.h"
#include "dm_public/i_array_interface.h"
#include "dm_public/object_definitions/collider_definitions.h"

#include <memory>

namespace avatar
{
    class IColliderHandle : public NonCopyable
    {
    public:
        virtual ColliderType GetColliderType() const = 0;
    };

    class IBoxColliderHandle : public IColliderHandle
    {
    public:
        virtual ColliderType GetColliderType() const override { return ColliderType::BOX; }

        virtual Vector3 GetHalfSize() const = 0;
        //virtual void SetHalfSize(const Vector3&) = 0;
    };

    class ICapsuleColliderHandle : public IColliderHandle
    {
    public:
        virtual ColliderType GetColliderType() const override { return ColliderType::CAPSULE; }

        virtual float GetRadius() const = 0;
        //virtual void SetRadius(float radius) = 0;
        virtual float GetHalfHeight() const = 0;
        //virtual void SetHalfHeight(float height) = 0;

    };

    class ISphereColliderHandle : public IColliderHandle
    {
    public:
        virtual ColliderType GetColliderType() const override { return ColliderType::SPHERE; }

        virtual float GetRadius() const = 0;
        //virtual void SetRadius(float radius) = 0;
    };

    class ICylinderColliderHandle : public IColliderHandle
    {
    public:
        virtual ColliderType GetColliderType() const override { return ColliderType::CYLINDER; }

        virtual float GetRadius() const = 0;
        //virtual void SetRadius(float radius) = 0;
        virtual float GetHalfHeight() const = 0;
        //virtual void SetHalfHeight(float halfheight) = 0;
    };

    class ICompoundColliderHandle : public IColliderHandle
    {
    public:
        virtual ColliderType GetColliderType() const override { return ColliderType::COMPOUND; }
        virtual void GetChildColliders(IArrayInterface<IColliderHandle*>& collidersOut) = 0;
        virtual bool GetChildColliderTransform(const IColliderHandle& colliderHandle, Transform& transformOut) const = 0;
    };
}
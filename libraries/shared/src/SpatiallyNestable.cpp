//
//  SpatiallyNestable.cpp
//  libraries/shared/src/
//
//  Created by Seth Alves on 2015-10-18
//  Copyright 2015 High Fidelity, Inc.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

#include "DependencyManager.h"
#include "SpatiallyNestable.h"

// TODO -- make use of parent joint index

Transform SpatiallyNestable::getParentTransform() const {
    Transform result;
    SpatiallyNestablePointer parent = getParentPointer();
    if (parent) {
        Transform parentTransform = parent->getTransform();
        result = parentTransform.setScale(1.0f);
    }
    return result;
}

SpatiallyNestablePointer SpatiallyNestable::getParentPointer() const {
    SpatiallyNestablePointer parent = _parent.lock();

    if (!parent && _parentID.isNull()) {
        // no parent
        return nullptr;
    }

    SpatiallyNestableConstPointer constThisPointer = shared_from_this();
    SpatiallyNestablePointer thisPointer = std::const_pointer_cast<SpatiallyNestable>(constThisPointer); // ermahgerd !!!

    if (parent && parent->getID() == _parentID) {
        // parent pointer is up-to-date
        if (!_parentKnowsMe) {
            parent->beParentOfChild(thisPointer);
            _parentKnowsMe = true;
        }
        return parent;
    }

    if (parent) {
        // we have a parent pointer but our _parentID doesn't indicate this parent.
        parent->forgetChild(thisPointer);
        _parentKnowsMe = false;
        _parent.reset();
    }

    // we have a _parentID but no parent pointer, or our parent pointer is to the wrong thing
    QSharedPointer<SpatialParentFinder> parentFinder = DependencyManager::get<SpatialParentFinder>();
    _parent = parentFinder->find(_parentID);
    parent = _parent.lock();
    if (parent) {
        parent->beParentOfChild(thisPointer);
        _parentKnowsMe = true;
    }
    return parent;
}

void SpatiallyNestable::beParentOfChild(SpatiallyNestablePointer newChild) const {
    _children[newChild->getID()] = newChild;
}

void SpatiallyNestable::forgetChild(SpatiallyNestablePointer newChild) const {
    _children.remove(newChild->getID());
}


void SpatiallyNestable::setParentID(const QUuid& parentID) {
    _parentID = parentID;
    _parentKnowsMe = false;
}

const glm::vec3& SpatiallyNestable::getPosition() const {
    Transform parentTransformDescaled = getParentTransform();
    glm::mat4 parentMat;
    parentTransformDescaled.getMatrix(parentMat);
    glm::vec4 absPos = parentMat * glm::vec4(getLocalPosition(), 1.0f);
    _absolutePositionCache = glm::vec3(absPos);
    return _absolutePositionCache;
}

void SpatiallyNestable::setPosition(const glm::vec3& position) {
    Transform parentTransform = getParentTransform();
    Transform myWorldTransform;
    Transform::mult(myWorldTransform, parentTransform, _transform);
    myWorldTransform.setTranslation(position);
    Transform::inverseMult(_transform, parentTransform, myWorldTransform);
}

const glm::quat& SpatiallyNestable::getOrientation() const {
    Transform parentTransformDescaled = getParentTransform();
    _absoluteRotationCache = parentTransformDescaled.getRotation() * getLocalOrientation();
    return _absoluteRotationCache;
}

void SpatiallyNestable::setOrientation(const glm::quat& orientation) {
    Transform parentTransform = getParentTransform();
    Transform myWorldTransform;
    Transform::mult(myWorldTransform, parentTransform, _transform);
    myWorldTransform.setRotation(orientation);
    Transform::inverseMult(_transform, parentTransform, myWorldTransform);
}

const Transform& SpatiallyNestable::getTransform() const {
    Transform parentTransform = getParentTransform();
    Transform::mult(_worldTransformCache, parentTransform, _transform);
    return _worldTransformCache;
}

void SpatiallyNestable::setTransform(const Transform& transform) {
    Transform parentTransform = getParentTransform();
    Transform::inverseMult(_transform, parentTransform, transform);
}

const glm::vec3& SpatiallyNestable::getScale() const {
    return _transform.getScale();
}

void SpatiallyNestable::setScale(const glm::vec3& scale) {
    _transform.setScale(scale);
}

const Transform& SpatiallyNestable::getLocalTransform() const {
    return _transform;
}

void SpatiallyNestable::setLocalTransform(const Transform& transform) {
}

const glm::vec3& SpatiallyNestable::getLocalPosition() const {
    return _transform.getTranslation();
}

void SpatiallyNestable::setLocalPosition(const glm::vec3& position) {
    _transform.setTranslation(position);
}

const glm::quat& SpatiallyNestable::getLocalOrientation() const {
    return _transform.getRotation();
}

void SpatiallyNestable::setLocalOrientation(const glm::quat& orientation) {
    _transform.setRotation(orientation);
}

const glm::vec3& SpatiallyNestable::getLocalScale() const {
    return _transform.getScale();
}

void SpatiallyNestable::setLocalScale(const glm::vec3& scale) {
    _transform.setScale(scale);
}

QList<SpatiallyNestablePointer> SpatiallyNestable::getChildren() const {
    QList<SpatiallyNestablePointer> children;
    foreach (SpatiallyNestableWeakPointer childWP, _children.values()) {
        SpatiallyNestablePointer child = childWP.lock();
        if (child) {
            children << child;
        }
    }
    return children;
}

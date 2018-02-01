//
//  entitySelectionTool.js
//  examples
//
//  Created by Brad hefta-Gaub on 10/1/14.
//    Modified by Daniela Fontes * @DanielaFifo and Tiago Andrade @TagoWill on 4/7/2017
//    Modified by David Back on 1/9/2018
//  Copyright 2014 High Fidelity, Inc.
//
//  This script implements a class useful for building tools for editing entities.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//

/* global HIFI_PUBLIC_BUCKET, SPACE_LOCAL, Script, SelectionManager */

HIFI_PUBLIC_BUCKET = "http://s3.amazonaws.com/hifi-public/";

SPACE_LOCAL = "local";
SPACE_WORLD = "world";

Script.include("./controllers.js");

SelectionManager = (function() {
    var that = {};

    // FUNCTION: SUBSCRIBE TO UPDATE MESSAGES
    function subscribeToUpdateMessages() {
        Messages.subscribe("entityToolUpdates");
        Messages.messageReceived.connect(handleEntitySelectionToolUpdates);
    }

    // FUNCTION: HANDLE ENTITY SELECTION TOOL UDPATES
    function handleEntitySelectionToolUpdates(channel, message, sender) {
        if (channel !== 'entityToolUpdates') {
            return;
        }
        if (sender !== MyAvatar.sessionUUID) {
            return;
        }

        var wantDebug = false;
        var messageParsed;
        try {
            messageParsed = JSON.parse(message);
        } catch (err) {
            print("ERROR: entitySelectionTool.handleEntitySelectionToolUpdates - got malformed message: " + message);
        }

        if (messageParsed.method === "selectEntity") {
            if (wantDebug) {
                print("setting selection to " + messageParsed.entityID);
            }
            that.setSelections([messageParsed.entityID]);
        }
    }

    subscribeToUpdateMessages();

    that.savedProperties = {};
    that.selections = [];
    var listeners = [];

    that.localRotation = Quat.IDENTITY;
    that.localPosition = Vec3.ZERO;
    that.localDimensions = Vec3.ZERO;
    that.localRegistrationPoint = Vec3.HALF;

    that.worldRotation = Quat.IDENTITY;
    that.worldPosition = Vec3.ZERO;
    that.worldDimensions = Vec3.ZERO;
    that.worldRegistrationPoint = Vec3.HALF;
    that.centerPosition = Vec3.ZERO;

    that.saveProperties = function() {
        that.savedProperties = {};
        for (var i = 0; i < that.selections.length; i++) {
            var entityID = that.selections[i];
            that.savedProperties[entityID] = Entities.getEntityProperties(entityID);
        }
    };

    that.addEventListener = function(func) {
        listeners.push(func);
    };

    that.hasSelection = function() {
        return that.selections.length > 0;
    };

    that.setSelections = function(entityIDs) {
        that.selections = [];
        for (var i = 0; i < entityIDs.length; i++) {
            var entityID = entityIDs[i];
            that.selections.push(entityID);
            //Selection.addToSelectedItemsList("contextOverlayHighlightList", "entity", entityID);
        }

        that._update(true);
    };

    that.addEntity = function(entityID, toggleSelection) {
        if (entityID) {
            var idx = -1;
            for (var i = 0; i < that.selections.length; i++) {
                if (entityID === that.selections[i]) {
                    idx = i;
                    break;
                }
            }
            if (idx === -1) {
                that.selections.push(entityID);
                //Selection.addToSelectedItemsList("contextOverlayHighlightList", "entity", entityID);
            } else if (toggleSelection) {
                that.selections.splice(idx, 1);
                //Selection.removeFromSelectedItemsList("contextOverlayHighlightList", "entity", entityID);
            }
        }

        that._update(true);
    };

    that.removeEntity = function(entityID) {
        var idx = that.selections.indexOf(entityID);
        if (idx >= 0) {
            that.selections.splice(idx, 1);
            //Selection.removeFromSelectedItemsList("contextOverlayHighlightList", "entity", entityID);
        }
        that._update(true);
    };

    that.clearSelections = function() {
        that.selections = [];
        that._update(true);
    };

    that._update = function(selectionUpdated) {
        var properties = null;
        if (that.selections.length === 0) {
            that.localDimensions = null;
            that.localPosition = null;
            that.worldDimensions = null;
            that.worldPosition = null;
            that.worldRotation = null;
        } else if (that.selections.length === 1) {
            properties = Entities.getEntityProperties(that.selections[0]);
            that.localDimensions = properties.dimensions;
            that.localPosition = properties.position;
            that.localRotation = properties.rotation;
            that.localRegistrationPoint = properties.registrationPoint;
            that.worldDimensions = properties.boundingBox.dimensions;
            that.worldPosition = properties.boundingBox.center;
            that.worldRotation = properties.boundingBox.rotation;
            SelectionDisplay.setSpaceMode(SPACE_LOCAL);
        } else {
            that.localRotation = null;
            that.localDimensions = null;
            that.localPosition = null;

            properties = Entities.getEntityProperties(that.selections[0]);

            var brn = properties.boundingBox.brn;
            var tfl = properties.boundingBox.tfl;

            for (var i = 1; i < that.selections.length; i++) {
                properties = Entities.getEntityProperties(that.selections[i]);
                var bb = properties.boundingBox;
                brn.x = Math.min(bb.brn.x, brn.x);
                brn.y = Math.min(bb.brn.y, brn.y);
                brn.z = Math.min(bb.brn.z, brn.z);
                tfl.x = Math.max(bb.tfl.x, tfl.x);
                tfl.y = Math.max(bb.tfl.y, tfl.y);
                tfl.z = Math.max(bb.tfl.z, tfl.z);
            }

            that.localDimensions = null;
            that.localPosition = null;
            that.worldDimensions = {
                x: tfl.x - brn.x,
                y: tfl.y - brn.y,
                z: tfl.z - brn.z
            };
            that.worldPosition = {
                x: brn.x + (that.worldDimensions.x / 2),
                y: brn.y + (that.worldDimensions.y / 2),
                z: brn.z + (that.worldDimensions.z / 2)
            };

            // For 1+ selections we can only modify selections in world space
            SelectionDisplay.setSpaceMode(SPACE_WORLD);
        }

        for (var j = 0; j < listeners.length; j++) {
            try {
                listeners[j](selectionUpdated === true);
            } catch (e) {
                print("ERROR: entitySelectionTool.update got exception: " + JSON.stringify(e));
            }
        }
    };

    return that;
})();

// Normalize degrees to be in the range (-180, 180]
function normalizeDegrees(degrees) {
    degrees = ((degrees + 180) % 360) - 180;
    if (degrees <= -180) {
        degrees += 360;
    }

    return degrees;
}

// FUNCTION: getRelativeCenterPosition
// Return the enter position of an entity relative to it's registrationPoint
// A registration point of (0.5, 0.5, 0.5) will have an offset of (0, 0, 0)
// A registration point of (1.0, 1.0, 1.0) will have an offset of (-dimensions.x / 2, -dimensions.y / 2, -dimensions.z / 2)
function getRelativeCenterPosition(dimensions, registrationPoint) {
    return {
        x: -dimensions.x * (registrationPoint.x - 0.5),
        y: -dimensions.y * (registrationPoint.y - 0.5),
        z: -dimensions.z * (registrationPoint.z - 0.5)
    };
}

// SELECTION DISPLAY DEFINITION
SelectionDisplay = (function() {
    var that = {};

    var COLOR_GREEN = { red:44, green:142, blue:14 };
    var COLOR_BLUE = { red:0, green:147, blue:197 };
    var COLOR_RED = { red:183, green:10, blue:55 };

    var GRABBER_TRANSLATE_ARROW_CYLINDER_OFFSET = 0.1;
    var GRABBER_TRANSLATE_ARROW_CYLINDER_CAMERA_DISTANCE_MULTIPLE = 0.005;
    var GRABBER_TRANSLATE_ARROW_CYLINDER_Y_MULTIPLE = 7.5;
    var GRABBER_TRANSLATE_ARROW_CONE_CAMERA_DISTANCE_MULTIPLE = 0.025;
    var GRABBER_ROTATE_RINGS_CAMERA_DISTANCE_MULTIPLE = 0.15;
    var GRABBER_STRETCH_SPHERE_OFFSET = 0.06;
    var GRABBER_STRETCH_SPHERE_CAMERA_DISTANCE_MULTIPLE = 0.01;
    var GRABBER_SCALE_CUBE_OFFSET = 0.5;
    var GRABBER_SCALE_CUBE_CAMERA_DISTANCE_MULTIPLE = 0.015;
    var GRABBER_CLONER_OFFSET = { x:0.9, y:-0.9, z:0.9 }; 

    var GRABBER_SCALE_CUBE_IDLE_COLOR = { red:106, green:106, blue:106 };
    var GRABBER_SCALE_CUBE_SELECTED_COLOR = { red:18, green:18, blue:18 };
    var GRABBER_SCALE_EDGE_COLOR = { red:87, green:87, blue:87 };
    var GRABBER_HOVER_COLOR = { red:227, green:227, blue:227 };

    var SCALE_MINIMUM_DIMENSION = 0.02;
    var STRETCH_MINIMUM_DIMENSION = 0.001;
    var STRETCH_DIRECTION_ALL_FACTOR = 25;

    // These are multipliers for sizing the rotation degrees display while rotating an entity
    var ROTATION_DISPLAY_DISTANCE_MULTIPLIER = 1.0;
    var ROTATION_DISPLAY_SIZE_X_MULTIPLIER = 0.3;
    var ROTATION_DISPLAY_SIZE_Y_MULTIPLIER = 0.09;
    var ROTATION_DISPLAY_LINE_HEIGHT_MULTIPLIER = 0.07;

    var ROTATION_CTRL_SNAP_ANGLE = 22.5;
    var ROTATION_DEFAULT_SNAP_ANGLE = 1;
    var ROTATION_DEFAULT_TICK_MARKS_ANGLE = 5;

    var ROTATION_RING_IDLE_INNER_RADIUS = 0.97;
    var ROTATION_RING_SELECTED_INNER_RADIUS = 0.9;

    var TRANSLATE_DIRECTION = {
        X : 0,
        Y : 1,
        Z : 2
    }

    var STRETCH_DIRECTION = {
        X : 0,
        Y : 1,
        Z : 2,
        ALL : 3
    }

    var SCALE_DIRECTION = {
        LBN : 0,
        RBN : 1,
        LBF : 2,
        RBF : 3,
        LTN : 4,
        RTN : 5,
        LTF : 6,
        RTF : 7
    }

    var ROTATE_DIRECTION = {
        PITCH : 0,
        YAW : 1,
        ROLL : 2
    }

    var spaceMode = SPACE_LOCAL;
    var overlayNames = [];
    var lastCameraPosition = Camera.getPosition();
    var lastCameraOrientation = Camera.getOrientation();
    var lastControllerPoses = [
        getControllerWorldLocation(Controller.Standard.LeftHand, true),
        getControllerWorldLocation(Controller.Standard.RightHand, true)
    ];

    var rotZero;
    var rotationNormal;
    var rotDegreePos;

    var worldRotationX;
    var worldRotationY;
    var worldRotationZ;

    var ctrlPressed = false;

    var previousHandle = null;
    var previousHandleHelper = null;
    var previousHandleColor;

    var activeTool = null;
    var grabberTools = {};

    var grabberPropertiesTranslateArrowCones = {
        shape: "Cone",
        solid: true,
        visible: false,
        ignoreRayIntersection: false,
        drawInFront: true
    };
    var grabberPropertiesTranslateArrowCylinders = {
        shape: "Cylinder",
        solid: true,
        visible: false,
        ignoreRayIntersection: false,
        drawInFront: true
    };
    var grabberTranslateXCone = Overlays.addOverlay("shape", grabberPropertiesTranslateArrowCones);
    var grabberTranslateXCylinder = Overlays.addOverlay("shape", grabberPropertiesTranslateArrowCylinders);
    Overlays.editOverlay(grabberTranslateXCone, { color : COLOR_RED });
    Overlays.editOverlay(grabberTranslateXCylinder, { color : COLOR_RED });
    var grabberTranslateYCone = Overlays.addOverlay("shape", grabberPropertiesTranslateArrowCones);
    var grabberTranslateYCylinder = Overlays.addOverlay("shape", grabberPropertiesTranslateArrowCylinders);
    Overlays.editOverlay(grabberTranslateYCone, { color : COLOR_GREEN });
    Overlays.editOverlay(grabberTranslateYCylinder, { color : COLOR_GREEN });
    var grabberTranslateZCone = Overlays.addOverlay("shape", grabberPropertiesTranslateArrowCones);
    var grabberTranslateZCylinder = Overlays.addOverlay("shape", grabberPropertiesTranslateArrowCylinders);
    Overlays.editOverlay(grabberTranslateZCone, { color : COLOR_BLUE });
    Overlays.editOverlay(grabberTranslateZCylinder, { color : COLOR_BLUE });

    var grabberPropertiesRotateRings = {
        alpha: 1,
        solid: true,
        startAt: 0,
        endAt: 360,
        innerRadius: ROTATION_RING_IDLE_INNER_RADIUS,
        majorTickMarksAngle: ROTATION_DEFAULT_TICK_MARKS_ANGLE,
        majorTickMarksLength: 0.1,
        visible: false,
        ignoreRayIntersection: false,
        drawInFront: true
    };
    var grabberRotatePitchRing = Overlays.addOverlay("circle3d", grabberPropertiesRotateRings);
    Overlays.editOverlay(grabberRotatePitchRing, { 
        color : COLOR_RED,
        majorTickMarksColor: COLOR_RED,
    });
    var grabberRotateYawRing = Overlays.addOverlay("circle3d", grabberPropertiesRotateRings);
    Overlays.editOverlay(grabberRotateYawRing, { 
        color : COLOR_GREEN,
        majorTickMarksColor: COLOR_GREEN,
    });
    var grabberRotateRollRing = Overlays.addOverlay("circle3d", grabberPropertiesRotateRings);
    Overlays.editOverlay(grabberRotateRollRing, { 
        color : COLOR_BLUE,
        majorTickMarksColor: COLOR_BLUE,
    });

    var grabberRotateCurrentRing = Overlays.addOverlay("circle3d", {
        alpha: 1,
        color: { red: 255, green: 99, blue: 9 },
        solid: true,
        innerRadius: 0.9,
        visible: false,
        ignoreRayIntersection: true,
        drawInFront: true
    });

    var rotationDegreesDisplay = Overlays.addOverlay("text3d", {
        text: "",
        color: { red: 0, green: 0, blue: 0 },
        backgroundColor: { red: 255, green: 255, blue: 255 },
        alpha: 0.7,
        backgroundAlpha: 0.7,
        visible: false,
        isFacingAvatar: true,
        drawInFront: true,
        ignoreRayIntersection: true,
        dimensions: { x: 0, y: 0 },
        lineHeight: 0.0,
        topMargin: 0,
        rightMargin: 0,
        bottomMargin: 0,
        leftMargin: 0
    });

    var grabberPropertiesStretchSpheres = {
        shape: "Sphere",
        solid: true,
        visible: false,
        ignoreRayIntersection: false,
        drawInFront: true
    };
    var grabberStretchXSphere = Overlays.addOverlay("shape", grabberPropertiesStretchSpheres);
    Overlays.editOverlay(grabberStretchXSphere, { color : COLOR_RED });
    var grabberStretchYSphere = Overlays.addOverlay("shape", grabberPropertiesStretchSpheres);
    Overlays.editOverlay(grabberStretchYSphere, { color : COLOR_GREEN });
    var grabberStretchZSphere = Overlays.addOverlay("shape", grabberPropertiesStretchSpheres);
    Overlays.editOverlay(grabberStretchZSphere, { color : COLOR_BLUE });

    var grabberPropertiesStretchPanel = {
        shape: "Quad",
        alpha: 0.5,
        solid: true,
        visible: false,
        ignoreRayIntersection: true,
        drawInFront: true,
    }
    var grabberStretchXPanel = Overlays.addOverlay("shape", grabberPropertiesStretchPanel);
    Overlays.editOverlay(grabberStretchXPanel, { color : COLOR_RED });
    var grabberStretchYPanel = Overlays.addOverlay("shape", grabberPropertiesStretchPanel);
    Overlays.editOverlay(grabberStretchYPanel, { color : COLOR_GREEN });
    var grabberStretchZPanel = Overlays.addOverlay("shape", grabberPropertiesStretchPanel);
    Overlays.editOverlay(grabberStretchZPanel, { color : COLOR_BLUE });

    var grabberPropertiesScaleCubes = {
        size: 0.025,
        color: GRABBER_SCALE_CUBE_IDLE_COLOR,
        solid: true,
        visible: false,
        ignoreRayIntersection: false,
        drawInFront: true,
        borderSize: 1.4
    };
    var grabberScaleLBNCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // (-x, -y, -z)
    var grabberScaleRBNCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // (-x, -y,  z)
    var grabberScaleLBFCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // ( x, -y, -z)
    var grabberScaleRBFCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // ( x, -y,  z)
    var grabberScaleLTNCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // (-x,  y, -z)
    var grabberScaleRTNCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // (-x,  y,  z)
    var grabberScaleLTFCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // ( x,  y, -z)
    var grabberScaleRTFCube = Overlays.addOverlay("cube", grabberPropertiesScaleCubes); // ( x,  y,  z)

    var grabberPropertiesScaleEdge = {
        color: GRABBER_SCALE_EDGE_COLOR,
        visible: false,
        ignoreRayIntersection: true,
        drawInFront: true,
        lineWidth: 0.2
    }
    var grabberScaleTREdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleTLEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleTFEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleTNEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleBREdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleBLEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleBFEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleBNEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleNREdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleNLEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleFREdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);
    var grabberScaleFLEdge = Overlays.addOverlay("line3d", grabberPropertiesScaleEdge);

    var grabberCloner = Overlays.addOverlay("cube", {
        size: 0.05,
        color: COLOR_GREEN,
        solid: true,
        visible: false,
        ignoreRayIntersection: false,
        drawInFront: true,
        borderSize: 1.4
    });

    var selectionBox = Overlays.addOverlay("cube", {
        size: 1,
        color: COLOR_RED,
        alpha: 0, // setting to 0 alpha for now to keep this hidden vs using visible false because its used as the translate xz tool overlay
        solid: false,
        visible: false,
        dashed: false
    });

    var allOverlays = [
        grabberTranslateXCone,
        grabberTranslateXCylinder,
        grabberTranslateYCone,
        grabberTranslateYCylinder,
        grabberTranslateZCone,
        grabberTranslateZCylinder,
        grabberRotatePitchRing,
        grabberRotateYawRing,
        grabberRotateRollRing,
        grabberRotateCurrentRing,
        rotationDegreesDisplay,
        grabberStretchXSphere,
        grabberStretchYSphere,
        grabberStretchZSphere,
        grabberStretchXPanel,
        grabberStretchYPanel,
        grabberStretchZPanel,
        grabberScaleLBNCube,
        grabberScaleRBNCube,
        grabberScaleLBFCube,
        grabberScaleRBFCube,
        grabberScaleLTNCube,
        grabberScaleRTNCube,
        grabberScaleLTFCube,
        grabberScaleRTFCube,
        grabberScaleTREdge,
        grabberScaleTLEdge,
        grabberScaleTFEdge,
        grabberScaleTNEdge,
        grabberScaleBREdge,
        grabberScaleBLEdge,
        grabberScaleBFEdge,
        grabberScaleBNEdge,
        grabberScaleNREdge,
        grabberScaleNLEdge,
        grabberScaleFREdge,
        grabberScaleFLEdge,
        grabberCloner,
        selectionBox
    ];

    overlayNames[grabberTranslateXCone] = "grabberTranslateXCone";
    overlayNames[grabberTranslateXCylinder] = "grabberTranslateXCylinder";
    overlayNames[grabberTranslateYCone] = "grabberTranslateYCone";
    overlayNames[grabberTranslateYCylinder] = "grabberTranslateYCylinder";
    overlayNames[grabberTranslateZCone] = "grabberTranslateZCone";
    overlayNames[grabberTranslateZCylinder] = "grabberTranslateZCylinder";
    overlayNames[grabberRotatePitchRing] = "grabberRotatePitchRing";
    overlayNames[grabberRotateYawRing] = "grabberRotateYawRing";
    overlayNames[grabberRotateRollRing] = "grabberRotateRollRing";
    overlayNames[grabberRotateCurrentRing] = "grabberRotateCurrentRing";
    overlayNames[rotationDegreesDisplay] = "rotationDegreesDisplay";
    overlayNames[grabberStretchXSphere] = "grabberStretchXSphere";
    overlayNames[grabberStretchYSphere] = "grabberStretchYSphere";
    overlayNames[grabberStretchZSphere] = "grabberStretchZSphere";
    overlayNames[grabberStretchXPanel] = "grabberStretchXPanel";
    overlayNames[grabberStretchYPanel] = "grabberStretchYPanel";
    overlayNames[grabberStretchZPanel] = "grabberStretchZPanel";
    overlayNames[grabberScaleLBNCube] = "grabberScaleLBNCube";
    overlayNames[grabberScaleRBNCube] = "grabberScaleRBNCube";
    overlayNames[grabberScaleLBFCube] = "grabberScaleLBFCube";
    overlayNames[grabberScaleRBFCube] = "grabberScaleRBFCube";
    overlayNames[grabberScaleLTNCube] = "grabberScaleLTNCube";
    overlayNames[grabberScaleRTNCube] = "grabberScaleRTNCube";
    overlayNames[grabberScaleLTFCube] = "grabberScaleLTFCube";
    overlayNames[grabberScaleRTFCube] = "grabberScaleRTFCube";
    overlayNames[grabberScaleTREdge] = "grabberScaleTREdge";
    overlayNames[grabberScaleTLEdge] = "grabberScaleTLEdge";
    overlayNames[grabberScaleTFEdge] = "grabberScaleTFEdge";
    overlayNames[grabberScaleTNEdge] = "grabberScaleTNEdge";
    overlayNames[grabberScaleBREdge] = "grabberScaleBREdge";
    overlayNames[grabberScaleBLEdge] = "grabberScaleBLEdge";
    overlayNames[grabberScaleBFEdge] = "grabberScaleBFEdge";
    overlayNames[grabberScaleBNEdge] = "grabberScaleBNEdge";
    overlayNames[grabberScaleNREdge] = "grabberScaleNREdge";
    overlayNames[grabberScaleNLEdge] = "grabberScaleNLEdge";
    overlayNames[grabberScaleFREdge] = "grabberScaleFREdge";
    overlayNames[grabberScaleFLEdge] = "grabberScaleFLEdge";
    overlayNames[grabberCloner] = "grabberCloner";
    overlayNames[selectionBox] = "selectionBox";

    // We get mouseMoveEvents from the handControllers, via handControllerPointer.
    // But we dont' get mousePressEvents.
    that.triggerMapping = Controller.newMapping(Script.resolvePath('') + '-click');
    Script.scriptEnding.connect(that.triggerMapping.disable);
    that.TRIGGER_GRAB_VALUE = 0.85; //  From handControllerGrab/Pointer.js. Should refactor.
    that.TRIGGER_ON_VALUE = 0.4;
    that.TRIGGER_OFF_VALUE = 0.15;
    that.triggered = false;
    var activeHand = Controller.Standard.RightHand;
    function makeTriggerHandler(hand) {
        return function (value) {
            if (!that.triggered && (value > that.TRIGGER_GRAB_VALUE)) { // should we smooth?
                that.triggered = true;
                if (activeHand !== hand) {
                    // No switching while the other is already triggered, so no need to release.
                    activeHand = (activeHand === Controller.Standard.RightHand) ?
                        Controller.Standard.LeftHand : Controller.Standard.RightHand;
                }
                if (Reticle.pointingAtSystemOverlay || Overlays.getOverlayAtPoint(Reticle.position)) {
                    return;
                }
                that.mousePressEvent({});
            } else if (that.triggered && (value < that.TRIGGER_OFF_VALUE)) {
                that.triggered = false;
                that.mouseReleaseEvent({});
            }
        };
    }
    that.triggerMapping.from(Controller.Standard.RT).peek().to(makeTriggerHandler(Controller.Standard.RightHand));
    that.triggerMapping.from(Controller.Standard.LT).peek().to(makeTriggerHandler(Controller.Standard.LeftHand));

    // Control key remains active only while key is held down
    function keyReleaseEvent(key) {
        if (key.key === 16777249) {
            ctrlPressed = false;
            that.updateActiveRotateRing();
        }
    }

    // Triggers notification on specific key driven events
    function keyPressEvent(key) {
        if (key.key === 16777249) {
            ctrlPressed = true;
            that.updateActiveRotateRing();
        }
    }

    Controller.keyPressEvent.connect(keyPressEvent);
    Controller.keyReleaseEvent.connect(keyReleaseEvent);

    function controllerComputePickRay() {
        var controllerPose = getControllerWorldLocation(activeHand, true);
        if (controllerPose.valid && that.triggered) {
            var controllerPosition = controllerPose.translation;
            // This gets point direction right, but if you want general quaternion it would be more complicated:
            var controllerDirection = Quat.getUp(controllerPose.rotation);
            return {origin: controllerPosition, direction: controllerDirection};
        }
    }

    function generalComputePickRay(x, y) {
        return controllerComputePickRay() || Camera.computePickRay(x, y);
    }
    
    function addGrabberTool(overlay, tool) {
        grabberTools[overlay] = tool;
        return tool;
    }

    function addGrabberTranslateTool(overlay, mode, direction) {
        var pickNormal = null;
        var lastPick = null;
        var projectionVector = null;
        addGrabberTool(overlay, {
            mode: mode,
            onBegin: function(event, pickRay, pickResult) {
                if (direction === TRANSLATE_DIRECTION.X) {
                    pickNormal = { x:0, y:0, z:1 };
                } else if (direction === TRANSLATE_DIRECTION.Y) {
                    pickNormal = { x:1, y:0, z:0 };
                } else if (direction === TRANSLATE_DIRECTION.Z) {
                    pickNormal = { x:0, y:1, z:0 };
                }

                var rotation = spaceMode === SPACE_LOCAL ? SelectionManager.localRotation : SelectionManager.worldRotation;
                pickNormal = Vec3.multiplyQbyV(rotation, pickNormal);

                lastPick = rayPlaneIntersection(pickRay, SelectionManager.worldPosition, pickNormal);
    
                SelectionManager.saveProperties();
                that.resetPreviousHandleColor();

                that.setGrabberTranslateXVisible(direction === TRANSLATE_DIRECTION.X);
                that.setGrabberTranslateYVisible(direction === TRANSLATE_DIRECTION.Y);
                that.setGrabberTranslateZVisible(direction === TRANSLATE_DIRECTION.Z);
                that.setGrabberRotateVisible(false);
                that.setGrabberStretchVisible(false);
                that.setGrabberScaleVisible(false);
                that.setGrabberClonerVisible(false);
    
                // Duplicate entities if alt is pressed.  This will make a
                // copy of the selected entities and move the _original_ entities, not
                // the new ones.
                if (event.isAlt) {
                    duplicatedEntityIDs = [];
                    for (var otherEntityID in SelectionManager.savedProperties) {
                        var properties = SelectionManager.savedProperties[otherEntityID];
                        if (!properties.locked) {
                            var entityID = Entities.addEntity(properties);
                            duplicatedEntityIDs.push({
                                entityID: entityID,
                                properties: properties
                            });
                        }
                    }
                } else {
                    duplicatedEntityIDs = null;
                }
            },
            onEnd: function(event, reason) {
                pushCommandForSelections(duplicatedEntityIDs);
            },
            onMove: function(event) {
                pickRay = generalComputePickRay(event.x, event.y);
    
                // translate mode left/right based on view toward entity
                var newIntersection = rayPlaneIntersection(pickRay, SelectionManager.worldPosition, pickNormal);
                var vector = Vec3.subtract(newIntersection, lastPick);
                
                if (direction === TRANSLATE_DIRECTION.X) {
                    projectionVector = { x:1, y:0, z:0 };
                } else if (direction === TRANSLATE_DIRECTION.Y) {
                    projectionVector = { x:0, y:1, z:0 };
                } else if (direction === TRANSLATE_DIRECTION.Z) {
                    projectionVector = { x:0, y:0, z:1 };
                }

                var rotation = spaceMode === SPACE_LOCAL ? SelectionManager.localRotation : SelectionManager.worldRotation;
                projectionVector = Vec3.multiplyQbyV(rotation, projectionVector);

                var dotVector = Vec3.dot(vector, projectionVector);
                vector = Vec3.multiply(dotVector, projectionVector);
                vector = grid.snapToGrid(vector);
    
                var wantDebug = false;
                if (wantDebug) {
                    print("translateUpDown... ");
                    print("                event.y:" + event.y);
                    Vec3.print("        newIntersection:", newIntersection);
                    Vec3.print("                 vector:", vector);
                    // Vec3.print("            newPosition:", newPosition);
                }
    
                for (var i = 0; i < SelectionManager.selections.length; i++) {
                    var id = SelectionManager.selections[i];
                    var properties = SelectionManager.savedProperties[id];
                    var newPosition = Vec3.sum(properties.position, vector);
                    Entities.editEntity(id, { position: newPosition });
                }
    
                SelectionManager._update();
            }
        });
    }

    // FUNCTION: VEC 3 MULT
    var vec3Mult = function(v1, v2) {
        return {
            x: v1.x * v2.x,
            y: v1.y * v2.y,
            z: v1.z * v2.z
        };
    };

    function makeStretchTool(stretchMode, directionEnum, directionVec, pivot, offset, stretchPanel, scaleGrabber) {
        var directionFor3DStretch = directionVec;
        var distanceFor3DStretch = 0;
        var DISTANCE_INFLUENCE_THRESHOLD = 1.2;
        
        var signs = {
            x: directionVec.x < 0 ? -1 : (directionVec.x > 0 ? 1 : 0),
            y: directionVec.y < 0 ? -1 : (directionVec.y > 0 ? 1 : 0),
            z: directionVec.z < 0 ? -1 : (directionVec.z > 0 ? 1 : 0)
        };

        var mask = {
            x: Math.abs(directionVec.x) > 0 ? 1 : 0,
            y: Math.abs(directionVec.y) > 0 ? 1 : 0,
            z: Math.abs(directionVec.z) > 0 ? 1 : 0
        };

        var numDimensions = mask.x + mask.y + mask.z;

        var planeNormal = null;
        var lastPick = null;
        var lastPick3D = null;
        var initialPosition = null;
        var initialDimensions = null;
        var initialIntersection = null;
        var initialProperties = null;
        var registrationPoint = null;
        var deltaPivot = null;
        var deltaPivot3D = null;
        var pickRayPosition = null;
        var pickRayPosition3D = null;
        var rotation = null;

        var onBegin = function(event, pickRay, pickResult) {
            var properties = Entities.getEntityProperties(SelectionManager.selections[0]);
            initialProperties = properties;
            rotation = (spaceMode === SPACE_LOCAL) ? properties.rotation : Quat.IDENTITY;

            if (spaceMode === SPACE_LOCAL) {
                rotation = SelectionManager.localRotation;
                initialPosition = SelectionManager.localPosition;
                initialDimensions = SelectionManager.localDimensions;
                registrationPoint = SelectionManager.localRegistrationPoint;
            } else {
                rotation = SelectionManager.worldRotation;
                initialPosition = SelectionManager.worldPosition;
                initialDimensions = SelectionManager.worldDimensions;
                registrationPoint = SelectionManager.worldRegistrationPoint;
            }

            // Modify range of registrationPoint to be [-0.5, 0.5]
            var centeredRP = Vec3.subtract(registrationPoint, {
                x: 0.5,
                y: 0.5,
                z: 0.5
            });

            // Scale pivot to be in the same range as registrationPoint
            var scaledPivot = Vec3.multiply(0.5, pivot);
            deltaPivot = Vec3.subtract(centeredRP, scaledPivot);

            var scaledOffset = Vec3.multiply(0.5, offset);

            // Offset from the registration point
            offsetRP = Vec3.subtract(scaledOffset, centeredRP);

            // Scaled offset in world coordinates
            var scaledOffsetWorld = vec3Mult(initialDimensions, offsetRP);
            
            pickRayPosition = Vec3.sum(initialPosition, Vec3.multiplyQbyV(rotation, scaledOffsetWorld));
            
            if (directionFor3DStretch) {
                // pivot, offset and pickPlanePosition for 3D manipulation
                var scaledPivot3D = Vec3.multiply(0.5, Vec3.multiply(1.0, directionFor3DStretch));
                deltaPivot3D = Vec3.subtract(centeredRP, scaledPivot3D);
                
                var scaledOffsetWorld3D = vec3Mult(initialDimensions, 
                    Vec3.subtract(Vec3.multiply(0.5, Vec3.multiply(-1.0, directionFor3DStretch)), centeredRP));
                
                pickRayPosition3D = Vec3.sum(initialPosition, Vec3.multiplyQbyV(rotation, scaledOffsetWorld));
            }
            var start = null;
            var end = null;
            if ((numDimensions === 1) && mask.x) {
                start = Vec3.multiplyQbyV(rotation, {
                    x: -10000,
                    y: 0,
                    z: 0
                });
                start = Vec3.sum(start, properties.position);
                end = Vec3.multiplyQbyV(rotation, {
                    x: 10000,
                    y: 0,
                    z: 0
                });
                end = Vec3.sum(end, properties.position);
            }
            if ((numDimensions === 1) && mask.y) {
                start = Vec3.multiplyQbyV(rotation, {
                    x: 0,
                    y: -10000,
                    z: 0
                });
                start = Vec3.sum(start, properties.position);
                end = Vec3.multiplyQbyV(rotation, {
                    x: 0,
                    y: 10000,
                    z: 0
                });
                end = Vec3.sum(end, properties.position);
            }
            if ((numDimensions === 1) && mask.z) {
                start = Vec3.multiplyQbyV(rotation, {
                    x: 0,
                    y: 0,
                    z: -10000
                });
                start = Vec3.sum(start, properties.position);
                end = Vec3.multiplyQbyV(rotation, {
                    x: 0,
                    y: 0,
                    z: 10000
                });
                end = Vec3.sum(end, properties.position);
            }
            if (numDimensions === 1) {
                if (mask.x === 1) {
                    planeNormal = {
                        x: 0,
                        y: 1,
                        z: 0
                    };
                } else if (mask.y === 1) {
                    planeNormal = {
                        x: 1,
                        y: 0,
                        z: 0
                    };
                } else {
                    planeNormal = {
                        x: 0,
                        y: 1,
                        z: 0
                    };
                }
            } else if (numDimensions === 2) {
                if (mask.x === 0) {
                    planeNormal = {
                        x: 1,
                        y: 0,
                        z: 0
                    };
                } else if (mask.y === 0) {
                    planeNormal = {
                        x: 0,
                        y: 1,
                        z: 0
                    };
                } else {
                    planeNormal = {
                        x: 0,
                        y: 0,
                        z: 1
                    };
                }
            }
            
            planeNormal = Vec3.multiplyQbyV(rotation, planeNormal);
            lastPick = rayPlaneIntersection(pickRay,
                pickRayPosition,
                planeNormal);
                
            var planeNormal3D = {
                x: 0,
                y: 0,
                z: 0
            };
            if (directionFor3DStretch) {
                lastPick3D = rayPlaneIntersection(pickRay,
                    pickRayPosition3D,
                    planeNormal3D);
                distanceFor3DStretch = Vec3.length(Vec3.subtract(pickRayPosition3D, pickRay.origin));
            }

            that.setGrabberTranslateVisible(false);
            that.setGrabberRotateVisible(false);
            that.setGrabberScaleVisible(true);
            that.setGrabberStretchXVisible(directionEnum === STRETCH_DIRECTION.X);
            that.setGrabberStretchYVisible(directionEnum === STRETCH_DIRECTION.Y);
            that.setGrabberStretchZVisible(directionEnum === STRETCH_DIRECTION.Z);
            that.setGrabberClonerVisible(false);
        
            SelectionManager.saveProperties();
            that.resetPreviousHandleColor();

            if (stretchPanel != null) {
                Overlays.editOverlay(stretchPanel, { visible: true });
            }
            if (scaleGrabber != null) {
                Overlays.editOverlay(scaleGrabber, { color: GRABBER_SCALE_CUBE_SELECTED_COLOR });
            }
        };

        var onEnd = function(event, reason) {    
            if (stretchPanel != null) {
                Overlays.editOverlay(stretchPanel, { visible: false });
            }
            if (scaleGrabber != null) {
                Overlays.editOverlay(scaleGrabber, { color: GRABBER_SCALE_CUBE_IDLE_COLOR });
            }
            pushCommandForSelections();
        };

        var onMove = function(event) {
            var proportional = (spaceMode === SPACE_WORLD) || event.isShifted || directionEnum === STRETCH_DIRECTION.ALL;
            
            var position, dimensions, rotation;
            if (spaceMode === SPACE_LOCAL) {
                position = SelectionManager.localPosition;
                dimensions = SelectionManager.localDimensions;
                rotation = SelectionManager.localRotation;
            } else {
                position = SelectionManager.worldPosition;
                dimensions = SelectionManager.worldDimensions;
                rotation = SelectionManager.worldRotation;
            }
            
            var localDeltaPivot = deltaPivot;
            var localSigns = signs;
    
            var pickRay = generalComputePickRay(event.x, event.y);
            
            // Are we using handControllers or Mouse - only relevant for 3D tools
            var controllerPose = getControllerWorldLocation(activeHand, true);
            var vector = null;
            if (HMD.isHMDAvailable() && HMD.isHandControllerAvailable() && 
                    controllerPose.valid && that.triggered && directionFor3DStretch) {
                localDeltaPivot = deltaPivot3D;
    
                newPick = pickRay.origin;
            
                vector = Vec3.subtract(newPick, lastPick3D);
                
                vector = Vec3.multiplyQbyV(Quat.inverse(rotation), vector);
            
                if (distanceFor3DStretch > DISTANCE_INFLUENCE_THRESHOLD) {
                    // Range of Motion
                    vector = Vec3.multiply(distanceFor3DStretch , vector);
                }
                
                localSigns = directionFor3DStretch;
                
            } else {
                newPick = rayPlaneIntersection(pickRay,
                    pickRayPosition,
                    planeNormal);
                vector = Vec3.subtract(newPick, lastPick);
    
                vector = Vec3.multiplyQbyV(Quat.inverse(rotation), vector);
    
                vector = vec3Mult(mask, vector);
                
            }
            
            vector = grid.snapToSpacing(vector);
    
            var changeInDimensions = Vec3.multiply(-1, vec3Mult(localSigns, vector));

            if (directionEnum === STRETCH_DIRECTION.ALL) {
                changeInDimensions = Vec3.multiply(changeInDimensions, STRETCH_DIRECTION_ALL_FACTOR);
            }

            var newDimensions;
            if (proportional) {
                var absX = Math.abs(changeInDimensions.x);
                var absY = Math.abs(changeInDimensions.y);
                var absZ = Math.abs(changeInDimensions.z);
                var pctChange = 0;
                if (absX > absY && absX > absZ) {
                    pctChange = changeInDimensions.x / initialProperties.dimensions.x;
                    pctChange = changeInDimensions.x / initialDimensions.x;
                } else if (absY > absZ) {
                    pctChange = changeInDimensions.y / initialProperties.dimensions.y;
                    pctChange = changeInDimensions.y / initialDimensions.y;
                } else {
                    pctChange = changeInDimensions.z / initialProperties.dimensions.z;
                    pctChange = changeInDimensions.z / initialDimensions.z;
                }
                pctChange += 1.0;
                newDimensions = Vec3.multiply(pctChange, initialDimensions);
            } else {
                newDimensions = Vec3.sum(initialDimensions, changeInDimensions);
            }
    
            newDimensions.x = Math.max(newDimensions.x, STRETCH_MINIMUM_DIMENSION);
            newDimensions.y = Math.max(newDimensions.y, STRETCH_MINIMUM_DIMENSION);
            newDimensions.z = Math.max(newDimensions.z, STRETCH_MINIMUM_DIMENSION);
    
            var changeInPosition = Vec3.multiplyQbyV(rotation, vec3Mult(localDeltaPivot, changeInDimensions));
            if (directionEnum === STRETCH_DIRECTION.ALL) {
                changeInPosition = { x:0, y:0, z:0 };
            }
            var newPosition = Vec3.sum(initialPosition, changeInPosition);
    
            for (var i = 0; i < SelectionManager.selections.length; i++) {
                Entities.editEntity(SelectionManager.selections[i], {
                    position: newPosition,
                    dimensions: newDimensions
                });
            }
                
            var wantDebug = false;
            if (wantDebug) {
                print(stretchMode);
                // Vec3.print("        newIntersection:", newIntersection);
                Vec3.print("                 vector:", vector);
                // Vec3.print("           oldPOS:", oldPOS);
                // Vec3.print("                newPOS:", newPOS);
                Vec3.print("            changeInDimensions:", changeInDimensions);
                Vec3.print("                 newDimensions:", newDimensions);
    
                Vec3.print("              changeInPosition:", changeInPosition);
                Vec3.print("                   newPosition:", newPosition);
            }
    
            SelectionManager._update();
        };// End of onMove def

        return {
            mode: stretchMode,
            onBegin: onBegin,
            onMove: onMove,
            onEnd: onEnd
        };
    }

    function addGrabberStretchTool(overlay, mode, directionEnum) {
        var directionVec, pivot, offset, stretchPanel;
        if (directionEnum === STRETCH_DIRECTION.X) {
            stretchPanel = grabberStretchXPanel;
            directionVec = { x:-1, y:0, z:0 };
        } else if (directionEnum === STRETCH_DIRECTION.Y) {
            stretchPanel = grabberStretchYPanel;
            directionVec = { x:0, y:-1, z:0 };
        } else if (directionEnum === STRETCH_DIRECTION.Z) {
            stretchPanel = grabberStretchZPanel
            directionVec = { x:0, y:0, z:-1 };
        }
        pivot = directionVec;
        offset = Vec3.multiply(directionVec, -1);
        var tool = makeStretchTool(mode, directionEnum, directionVec, pivot, offset, stretchPanel, null);
        return addGrabberTool(overlay, tool);
    }

    function addGrabberScaleTool(overlay, mode, directionEnum) {
        var directionVec, pivot, offset, selectedGrabber;
        if (directionEnum === SCALE_DIRECTION.LBN) {
            directionVec = { x:1, y:1, z:1 };
            selectedGrabber = grabberScaleLBNCube;
        } else if (directionEnum === SCALE_DIRECTION.RBN) {
            directionVec = { x:1, y:1, z:-1 };
            selectedGrabber = grabberScaleRBNCube;
        } else if (directionEnum === SCALE_DIRECTION.LBF) {
            directionVec = { x:-1, y:1, z:1 };
            selectedGrabber = grabberScaleLBFCube;
        } else if (directionEnum === SCALE_DIRECTION.RBF) {
            directionVec = { x:-1, y:1, z:-1 };
            selectedGrabber = grabberScaleRBFCube;
        } else if (directionEnum === SCALE_DIRECTION.LTN) { 
            directionVec = { x:1, y:-1, z:1 };
            selectedGrabber = grabberScaleLTNCube;
        } else if (directionEnum === SCALE_DIRECTION.RTN) {
            directionVec = { x:1, y:-1, z:-1 };
            selectedGrabber = grabberScaleRTNCube;
        } else if (directionEnum === SCALE_DIRECTION.LTF) {
            directionVec = { x:-1, y:-1, z:1 };
            selectedGrabber = grabberScaleLTFCube;
        } else if (directionEnum === SCALE_DIRECTION.RTF) {
            directionVec = { x:-1, y:-1, z:-1 };
            selectedGrabber = grabberScaleRTFCube;
        }
        pivot = directionVec;
        offset = Vec3.multiply(directionVec, -1);
        var tool = makeStretchTool(mode, STRETCH_DIRECTION.ALL, directionVec, pivot, offset, null, selectedGrabber);
        return addGrabberTool(overlay, tool);
    }

    // FUNCTION: UPDATE ROTATION DEGREES OVERLAY
    function updateRotationDegreesOverlay(angleFromZero, position) {
        var angle = angleFromZero * (Math.PI / 180);
        var cameraPosition = Camera.getPosition();
        var entityToCameraDistance = Vec3.length(Vec3.subtract(cameraPosition, position));
        var overlayProps = {
            position: position,
            dimensions: {
                x: entityToCameraDistance * ROTATION_DISPLAY_SIZE_X_MULTIPLIER,
                y: entityToCameraDistance * ROTATION_DISPLAY_SIZE_Y_MULTIPLIER
            },
            lineHeight: entityToCameraDistance * ROTATION_DISPLAY_LINE_HEIGHT_MULTIPLIER,
            text: normalizeDegrees(-angleFromZero) + "°"
        };
        Overlays.editOverlay(rotationDegreesDisplay, overlayProps);
    }

    // FUNCTION DEF: updateSelectionsRotation
    //    Helper func used by rotation grabber tools 
    function updateSelectionsRotation(rotationChange) {
        if (!rotationChange) {
            print("ERROR: entitySelectionTool.updateSelectionsRotation - Invalid arg specified!!");

            // EARLY EXIT
            return;
        }
        
        // Entities should only reposition if we are rotating multiple selections around
        // the selections center point.  Otherwise, the rotation will be around the entities
        // registration point which does not need repositioning.
        var reposition = (SelectionManager.selections.length > 1);
        for (var i = 0; i < SelectionManager.selections.length; i++) {
            var entityID = SelectionManager.selections[i];
            var initialProperties = SelectionManager.savedProperties[entityID];

            var newProperties = {
                rotation: Quat.multiply(rotationChange, initialProperties.rotation)
            };

            if (reposition) {
                var dPos = Vec3.subtract(initialProperties.position, SelectionManager.worldPosition);
                dPos = Vec3.multiplyQbyV(rotationChange, dPos);
                newProperties.position = Vec3.sum(SelectionManager.worldPosition, dPos);
            }

            Entities.editEntity(entityID, newProperties);
        }
    }

    function addGrabberRotateTool(overlay, mode, direction) {
        var selectedGrabber = null;
        var worldRotation = null;
        addGrabberTool(overlay, {
            mode: mode,
            onBegin: function(event, pickRay, pickResult) {
                SelectionManager.saveProperties();
                that.resetPreviousHandleColor();
    
                that.setGrabberTranslateVisible(false);
                that.setGrabberRotatePitchVisible(direction === ROTATE_DIRECTION.PITCH);
                that.setGrabberRotateYawVisible(direction === ROTATE_DIRECTION.YAW);
                that.setGrabberRotateRollVisible(direction === ROTATE_DIRECTION.ROLL);
                that.setGrabberStretchVisible(false);
                that.setGrabberScaleVisible(false);
                that.setGrabberClonerVisible(false);

                if (direction === ROTATE_DIRECTION.PITCH) {
                    rotationNormal = { x: 1, y: 0, z: 0 };
                    worldRotation = worldRotationY;
                    selectedGrabber = grabberRotatePitchRing;
                } else if (direction === ROTATE_DIRECTION.YAW) {
                    rotationNormal = { x: 0, y: 1, z: 0 };
                    worldRotation = worldRotationZ;
                    selectedGrabber = grabberRotateYawRing;
                } else if (direction === ROTATE_DIRECTION.ROLL) {
                    rotationNormal = { x: 0, y: 0, z: 1 };
                    worldRotation = worldRotationX;
                    selectedGrabber = grabberRotateRollRing;
                }

                Overlays.editOverlay(selectedGrabber, { 
                    hasTickMarks: true,
                    solid: false,
                    innerRadius: ROTATION_RING_SELECTED_INNER_RADIUS
                });

                var rotation = spaceMode === SPACE_LOCAL ? SelectionManager.localRotation : SelectionManager.worldRotation;
                rotationNormal = Vec3.multiplyQbyV(rotation, rotationNormal);

                var rotCenter = SelectionManager.worldPosition;

                Overlays.editOverlay(rotationDegreesDisplay, { visible: true });
                Overlays.editOverlay(grabberRotateCurrentRing, {
                    position: rotCenter,
                    rotation: worldRotation,
                    startAt: 0,
                    endAt: 0,
                    visible: true
                });

                // editOverlays may not have committed rotation changes.
                // Compute zero position based on where the overlay will be eventually.
                var result = rayPlaneIntersection(pickRay, rotCenter, rotationNormal);
                // In case of a parallel ray, this will be null, which will cause early-out
                // in the onMove helper.
                rotZero = result;

                var rotCenterToZero = Vec3.subtract(rotZero, rotCenter);
                var rotCenterToZeroLength = Vec3.length(rotCenterToZero);
                rotDegreePos = Vec3.sum(rotCenter, Vec3.multiply(Vec3.normalize(rotCenterToZero), rotCenterToZeroLength * 1.75));
                updateRotationDegreesOverlay(0, rotDegreePos);
            },
            onEnd: function(event, reason) {
                Overlays.editOverlay(rotationDegreesDisplay, { visible: false });
                Overlays.editOverlay(selectedGrabber, { 
                    hasTickMarks: false,
                    solid: true,
                    innerRadius: ROTATION_RING_IDLE_INNER_RADIUS
                });
                Overlays.editOverlay(grabberRotateCurrentRing, { visible: false });
                pushCommandForSelections();
            },
            onMove: function(event) {
                if (!rotZero) {
                    print("ERROR: entitySelectionTool.handleRotationHandleOnMove - Invalid RotationZero Specified (missed rotation target plane?)");
        
                    // EARLY EXIT
                    return;
                }
                var pickRay = generalComputePickRay(event.x, event.y);
                var rotCenter = SelectionManager.worldPosition;
                var result = rayPlaneIntersection(pickRay, rotCenter, rotationNormal);
                if (result) {
                    var centerToZero = Vec3.subtract(rotZero, rotCenter);
                    var centerToIntersect = Vec3.subtract(result, rotCenter);
                    // Note: orientedAngle which wants normalized centerToZero and centerToIntersect
                    //             handles that internally, so it's to pass unnormalized vectors here.
                    var angleFromZero = Vec3.orientedAngle(centerToZero, centerToIntersect, rotationNormal);        
                    var snapAngle = ctrlPressed ? ROTATION_CTRL_SNAP_ANGLE : ROTATION_DEFAULT_SNAP_ANGLE;
                    angleFromZero = Math.floor(angleFromZero / snapAngle) * snapAngle;
                    var rotChange = Quat.angleAxis(angleFromZero, rotationNormal);
                    updateSelectionsRotation(rotChange);
                    updateRotationDegreesOverlay(-angleFromZero, rotDegreePos);

                    var startAtCurrent = 0;
                    var endAtCurrent = angleFromZero;
                    if (angleFromZero < 0) {
                        startAtCurrent = 360 + angleFromZero;
                        endAtCurrent = 360;
                    }
                    Overlays.editOverlay(grabberRotateCurrentRing, {
                        startAt: startAtCurrent,
                        endAt: endAtCurrent
                    });
                    // not sure why but this seems to be needed to fix an reverse rotation for yaw ring only
                    if (direction === ROTATE_DIRECTION.YAW) {
                        Overlays.editOverlay(grabberRotateCurrentRing, { rotation: worldRotationZ });
                    }

                }
            }
        });
    }

    // @param: toolHandle:  The overlayID associated with the tool
    //         that correlates to the tool you wish to query.
    // @note: If toolHandle is null or undefined then activeTool
    //        will be checked against those values as opposed to
    //        the tool registered under toolHandle.  Null & Undefined 
    //        are treated as separate values.
    // @return: bool - Indicates if the activeTool is that queried.
    function isActiveTool(toolHandle) {
        if (!toolHandle) {
            // Allow isActiveTool(null) and similar to return true if there's
            // no active tool
            return (activeTool === toolHandle);
        }

        if (!grabberTools.hasOwnProperty(toolHandle)) {
            print("WARNING: entitySelectionTool.isActiveTool - Encountered unknown grabberToolHandle: " + toolHandle + ". Tools should be registered via addGrabberTool.");
            // EARLY EXIT
            return false;
        }

        return (activeTool === grabberTools[ toolHandle ]);
    }

    // @return string - The mode of the currently active tool;
    //                  otherwise, "UNKNOWN" if there's no active tool.
    function getMode() {
        return (activeTool ? activeTool.mode : "UNKNOWN");
    }

    that.cleanup = function() {
        for (var i = 0; i < allOverlays.length; i++) {
            Overlays.deleteOverlay(allOverlays[i]);
        }
    };

    that.highlightSelectable = function(entityID) {
    };

    that.unhighlightSelectable = function(entityID) {
    };

    that.select = function(entityID, event) {
        var properties = Entities.getEntityProperties(SelectionManager.selections[0]);

        lastCameraPosition = Camera.getPosition();
        lastCameraOrientation = Camera.getOrientation();

        if (event !== false) {
            pickRay = generalComputePickRay(event.x, event.y);

            var wantDebug = false;
            if (wantDebug) {
                print("select() with EVENT...... ");
                print("                event.y:" + event.y);
                Vec3.print("       current position:", properties.position);
            }
        }

        that.updateGrabbers();
    };

    // FUNCTION: SET SPACE MODE
    that.setSpaceMode = function(newSpaceMode) {
        var wantDebug = false;
        if (wantDebug) {
            print("======> SetSpaceMode called. ========");
        }

        if (spaceMode !== newSpaceMode) {
            if (wantDebug) {
                print("    Updating SpaceMode From: " + spaceMode + " To: " + newSpaceMode);
            }
            spaceMode = newSpaceMode;
            that.updateGrabbers();
        } else if (wantDebug) {
            print("WARNING: entitySelectionTool.setSpaceMode - Can't update SpaceMode. CurrentMode: " + spaceMode + " DesiredMode: " + newSpaceMode);
        }
        if (wantDebug) {
            print("====== SetSpaceMode called. <========");
        }
    };

    // FUNCTION: UPDATE GRABBERS
    that.updateGrabbers = function() {
        var wantDebug = false;
        if (wantDebug) {
            print("======> Update Grabbers =======");
            print("    Selections Count: " + SelectionManager.selections.length);
            print("    SpaceMode: " + spaceMode);
            print("    DisplayMode: " + getMode());
        }

        if (SelectionManager.selections.length === 0) {
            that.setOverlaysVisible(false);
            return;
        }

        if (SelectionManager.hasSelection()) {
            var position = SelectionManager.worldPosition;
            var rotation = spaceMode === SPACE_LOCAL ? SelectionManager.localRotation : SelectionManager.worldRotation;
            var dimensions = spaceMode === SPACE_LOCAL ? SelectionManager.localDimensions : SelectionManager.worldDimensions;
            var rotationInverse = Quat.inverse(rotation);

            var cameraPosition = Camera.getPosition();
            var entityToCameraDistance = Vec3.length(Vec3.subtract(cameraPosition, position));

            var localRotationX = Quat.fromPitchYawRollDegrees(0, 0, -90);
            rotationX = Quat.multiply(rotation, localRotationX);
            worldRotationX = rotationX;
            var localRotationY = Quat.fromPitchYawRollDegrees(0, 90, 0);
            rotationY = Quat.multiply(rotation, localRotationY);
            worldRotationY = rotationY;
            var localRotationZ = Quat.fromPitchYawRollDegrees(90, 0, 0);
            rotationZ = Quat.multiply(rotation, localRotationZ);
            worldRotationZ = rotationZ;

            var arrowCylinderDimension = entityToCameraDistance * GRABBER_TRANSLATE_ARROW_CYLINDER_CAMERA_DISTANCE_MULTIPLE;
            var arrowCylinderDimensions = { x:arrowCylinderDimension, y:arrowCylinderDimension * GRABBER_TRANSLATE_ARROW_CYLINDER_Y_MULTIPLE, z:arrowCylinderDimension };
            var arrowConeDimension = entityToCameraDistance * GRABBER_TRANSLATE_ARROW_CONE_CAMERA_DISTANCE_MULTIPLE;
            var arrowConeDimensions = { x:arrowConeDimension, y:arrowConeDimension, z:arrowConeDimension };
            var cylinderXPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:GRABBER_TRANSLATE_ARROW_CYLINDER_OFFSET * entityToCameraDistance, y:0, z:0 }));
            Overlays.editOverlay(grabberTranslateXCylinder, { 
                position: cylinderXPos, 
                rotation: rotationX,
                dimensions: arrowCylinderDimensions
            });
            var cylinderXDiff = Vec3.subtract(cylinderXPos, position);
            var coneXPos = Vec3.sum(cylinderXPos, Vec3.multiply(Vec3.normalize(cylinderXDiff), arrowCylinderDimensions.y * 0.83));
            Overlays.editOverlay(grabberTranslateXCone, { 
                position: coneXPos, 
                rotation: rotationX,
                dimensions: arrowConeDimensions
            });
            var cylinderYPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:0, y:GRABBER_TRANSLATE_ARROW_CYLINDER_OFFSET * entityToCameraDistance, z:0 }));
            Overlays.editOverlay(grabberTranslateYCylinder, { 
                position: cylinderYPos, 
                rotation: rotationY,
                dimensions: arrowCylinderDimensions
            });
            var cylinderYDiff = Vec3.subtract(cylinderYPos, position);
            var coneYPos = Vec3.sum(cylinderYPos, Vec3.multiply(Vec3.normalize(cylinderYDiff), arrowCylinderDimensions.y * 0.83));
            Overlays.editOverlay(grabberTranslateYCone, { 
                position: coneYPos, 
                rotation: rotationY,
                dimensions: arrowConeDimensions
            });
            var cylinderZPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:0, y:0, z:GRABBER_TRANSLATE_ARROW_CYLINDER_OFFSET * entityToCameraDistance }));
            Overlays.editOverlay(grabberTranslateZCylinder, { 
                position: cylinderZPos, 
                rotation: rotationZ,
                dimensions: arrowCylinderDimensions
            });
            var cylinderZDiff = Vec3.subtract(cylinderZPos, position);
            var coneZPos = Vec3.sum(cylinderZPos, Vec3.multiply(Vec3.normalize(cylinderZDiff), arrowCylinderDimensions.y * 0.83));
            Overlays.editOverlay(grabberTranslateZCone, { 
                position: coneZPos, 
                rotation: rotationZ,
                dimensions: arrowConeDimensions
            });

            var grabberScaleCubeOffsetX = GRABBER_SCALE_CUBE_OFFSET * dimensions.x;
            var grabberScaleCubeOffsetY = GRABBER_SCALE_CUBE_OFFSET * dimensions.y;
            var grabberScaleCubeOffsetZ = GRABBER_SCALE_CUBE_OFFSET * dimensions.z;
            var scaleDimension = entityToCameraDistance * GRABBER_SCALE_CUBE_CAMERA_DISTANCE_MULTIPLE;
            var scaleDimensions = { x:scaleDimension, y:scaleDimension, z:scaleDimension };
            var grabberScaleLBNCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:-grabberScaleCubeOffsetX, y:-grabberScaleCubeOffsetY, z:-grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleLBNCube, { 
                position: grabberScaleLBNCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });
            var grabberScaleRBNCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:-grabberScaleCubeOffsetX, y:-grabberScaleCubeOffsetY, z:grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleRBNCube, { 
                position: grabberScaleRBNCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });
            var grabberScaleLBFCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:grabberScaleCubeOffsetX, y:-grabberScaleCubeOffsetY, z:-grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleLBFCube, { 
                position: grabberScaleLBFCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });
            var grabberScaleRBFCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:grabberScaleCubeOffsetX, y:-grabberScaleCubeOffsetY, z:grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleRBFCube, { 
                position: grabberScaleRBFCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });
            var grabberScaleLTNCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:-grabberScaleCubeOffsetX, y:grabberScaleCubeOffsetY, z:-grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleLTNCube, { 
                position: grabberScaleLTNCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });
            var grabberScaleRTNCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:-grabberScaleCubeOffsetX, y:grabberScaleCubeOffsetY, z:grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleRTNCube, { 
                position: grabberScaleRTNCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });
            var grabberScaleLTFCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:grabberScaleCubeOffsetX, y:grabberScaleCubeOffsetY, z:-grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleLTFCube, { 
                position: grabberScaleLTFCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });
            var grabberScaleRTFCubePos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:grabberScaleCubeOffsetX, y:grabberScaleCubeOffsetY, z:grabberScaleCubeOffsetZ }));
            Overlays.editOverlay(grabberScaleRTFCube, { 
                position: grabberScaleRTFCubePos, 
                rotation: rotation,
                dimensions: scaleDimensions
            });

            Overlays.editOverlay(grabberScaleTREdge, { start: grabberScaleRTNCubePos, end: grabberScaleRTFCubePos });
            Overlays.editOverlay(grabberScaleTLEdge, { start: grabberScaleLTNCubePos, end: grabberScaleLTFCubePos });
            Overlays.editOverlay(grabberScaleTFEdge, { start: grabberScaleLTFCubePos, end: grabberScaleRTFCubePos });
            Overlays.editOverlay(grabberScaleTNEdge, { start: grabberScaleLTNCubePos, end: grabberScaleRTNCubePos });
            Overlays.editOverlay(grabberScaleBREdge, { start: grabberScaleRBNCubePos, end: grabberScaleRBFCubePos });
            Overlays.editOverlay(grabberScaleBLEdge, { start: grabberScaleLBNCubePos, end: grabberScaleLBFCubePos });
            Overlays.editOverlay(grabberScaleBFEdge, { start: grabberScaleLBFCubePos, end: grabberScaleRBFCubePos });
            Overlays.editOverlay(grabberScaleBNEdge, { start: grabberScaleLBNCubePos, end: grabberScaleRBNCubePos });
            Overlays.editOverlay(grabberScaleNREdge, { start: grabberScaleRTNCubePos, end: grabberScaleRBNCubePos });
            Overlays.editOverlay(grabberScaleNLEdge, { start: grabberScaleLTNCubePos, end: grabberScaleLBNCubePos });
            Overlays.editOverlay(grabberScaleFREdge, { start: grabberScaleRTFCubePos, end: grabberScaleRBFCubePos });
            Overlays.editOverlay(grabberScaleFLEdge, { start: grabberScaleLTFCubePos, end: grabberScaleLBFCubePos });

            var stretchSphereDimension = entityToCameraDistance * GRABBER_STRETCH_SPHERE_CAMERA_DISTANCE_MULTIPLE;
            var stretchSphereDimensions = { x:stretchSphereDimension, y:stretchSphereDimension, z:stretchSphereDimension };
            var stretchXPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:GRABBER_STRETCH_SPHERE_OFFSET * entityToCameraDistance, y:0, z:0 }));
            Overlays.editOverlay(grabberStretchXSphere, { 
                position: stretchXPos, 
                dimensions: stretchSphereDimensions 
            });
            var grabberScaleLTFCubePosRot = Vec3.multiplyQbyV(rotationInverse, grabberScaleLTFCubePos);
            var grabberScaleRBFCubePosRot = Vec3.multiplyQbyV(rotationInverse, grabberScaleRBFCubePos);
            var stretchPanelXDimensions = Vec3.subtract(grabberScaleLTFCubePosRot, grabberScaleRBFCubePosRot);
            var tempY = Math.abs(stretchPanelXDimensions.y);
            stretchPanelXDimensions.x = 0.01;
            stretchPanelXDimensions.y = Math.abs(stretchPanelXDimensions.z);
            stretchPanelXDimensions.z = tempY;
            var stretchPanelXPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:dimensions.x / 2, y:0, z:0 }));
            Overlays.editOverlay(grabberStretchXPanel, { 
                position: stretchPanelXPos, 
                rotation: rotationZ,
                dimensions: stretchPanelXDimensions
            });
            var stretchYPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:0, y:GRABBER_STRETCH_SPHERE_OFFSET * entityToCameraDistance, z:0 }));
            Overlays.editOverlay(grabberStretchYSphere, { 
                position: stretchYPos, 
                dimensions: stretchSphereDimensions 
            });
            var grabberScaleLTFCubePosRot = Vec3.multiplyQbyV(rotationInverse, grabberScaleLTNCubePos);
            var grabberScaleRTNCubePosRot = Vec3.multiplyQbyV(rotationInverse, grabberScaleRTFCubePos);
            var stretchPanelYDimensions = Vec3.subtract(grabberScaleLTFCubePosRot, grabberScaleRTNCubePosRot);
            var tempX = Math.abs(stretchPanelYDimensions.x);
            stretchPanelYDimensions.x = Math.abs(stretchPanelYDimensions.z);
            stretchPanelYDimensions.y = 0.01;
            stretchPanelYDimensions.z = tempX;
            var stretchPanelYPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:0, y:dimensions.y / 2, z:0 }));
            Overlays.editOverlay(grabberStretchYPanel, { 
                position: stretchPanelYPos, 
                rotation: rotationY,
                dimensions: stretchPanelYDimensions
            });
            var stretchZPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:0, y:0, z:GRABBER_STRETCH_SPHERE_OFFSET * entityToCameraDistance }));
            Overlays.editOverlay(grabberStretchZSphere, { 
                position: stretchZPos, 
                dimensions: stretchSphereDimensions 
            });
            var grabberScaleRTFCubePosRot = Vec3.multiplyQbyV(rotationInverse, grabberScaleRTFCubePos);
            var grabberScaleRBNCubePosRot = Vec3.multiplyQbyV(rotationInverse, grabberScaleRBNCubePos);
            var stretchPanelZDimensions = Vec3.subtract(grabberScaleRTFCubePosRot, grabberScaleRBNCubePosRot);
            var tempX = Math.abs(stretchPanelZDimensions.x);
            stretchPanelZDimensions.x = Math.abs(stretchPanelZDimensions.y);
            stretchPanelZDimensions.y = tempX;
            stretchPanelZDimensions.z = 0.01;
            var stretchPanelZPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, { x:0, y:0, z:dimensions.z / 2 }));
            Overlays.editOverlay(grabberStretchZPanel, { 
                position: stretchPanelZPos, 
                rotation: rotationX,
                dimensions: stretchPanelZDimensions
            });

            var rotateDimension = entityToCameraDistance * GRABBER_ROTATE_RINGS_CAMERA_DISTANCE_MULTIPLE;
            var rotateDimensions = { x:rotateDimension, y:rotateDimension, z:rotateDimension };
            if (!isActiveTool(grabberRotatePitchRing)) {
                Overlays.editOverlay(grabberRotatePitchRing, { 
                    position: position, 
                    rotation: rotationY,
                    dimensions: rotateDimensions,
                    majorTickMarksAngle: ROTATION_DEFAULT_TICK_MARKS_ANGLE
                });
            }
            if (!isActiveTool(grabberRotateYawRing)) {
                Overlays.editOverlay(grabberRotateYawRing, { 
                    position: position, 
                    rotation: rotationZ,
                    dimensions: rotateDimensions,
                    majorTickMarksAngle: ROTATION_DEFAULT_TICK_MARKS_ANGLE
                });
            }
            if (!isActiveTool(grabberRotateRollRing)) {
                Overlays.editOverlay(grabberRotateRollRing, { 
                    position: position, 
                    rotation: rotationX,
                    dimensions: rotateDimensions,
                    majorTickMarksAngle: ROTATION_DEFAULT_TICK_MARKS_ANGLE
                });
            }
            Overlays.editOverlay(grabberRotateCurrentRing, { dimensions: rotateDimensions });
            that.updateActiveRotateRing();

            var inModeRotate = isActiveTool(grabberRotatePitchRing) || isActiveTool(grabberRotateYawRing) || isActiveTool(grabberRotateRollRing);
            var inModeTranslate = isActiveTool(grabberTranslateXCone) || isActiveTool(grabberTranslateXCylinder) ||
                                  isActiveTool(grabberTranslateYCone) || isActiveTool(grabberTranslateYCylinder) ||
                                  isActiveTool(grabberTranslateZCone) || isActiveTool(grabberTranslateZCylinder) ||
                                  isActiveTool(grabberCloner) || isActiveTool(selectionBox);

            Overlays.editOverlay(selectionBox, {
                position: position,
                rotation: rotation,
                dimensions: dimensions,
                visible: !inModeRotate
            });

            var grabberClonerOffset =  { x:GRABBER_CLONER_OFFSET.x * dimensions.x, y:GRABBER_CLONER_OFFSET.y * dimensions.y, z:GRABBER_CLONER_OFFSET.z * dimensions.z };
            var grabberClonerPos = Vec3.sum(position, Vec3.multiplyQbyV(rotation, grabberClonerOffset));
            Overlays.editOverlay(grabberCloner, {
                position: grabberClonerPos,
                rotation: rotation,
                dimensions: scaleDimensions
            });
        }

        that.setGrabberTranslateXVisible(!activeTool || isActiveTool(grabberTranslateXCone) || isActiveTool(grabberTranslateXCylinder));
        that.setGrabberTranslateYVisible(!activeTool || isActiveTool(grabberTranslateYCone) || isActiveTool(grabberTranslateYCylinder));
        that.setGrabberTranslateZVisible(!activeTool || isActiveTool(grabberTranslateZCone) || isActiveTool(grabberTranslateZCylinder));
        that.setGrabberRotatePitchVisible(!activeTool || isActiveTool(grabberRotatePitchRing));
        that.setGrabberRotateYawVisible(!activeTool || isActiveTool(grabberRotateYawRing));
        that.setGrabberRotateRollVisible(!activeTool || isActiveTool(grabberRotateRollRing));
        that.setGrabberStretchXVisible(!activeTool || isActiveTool(grabberStretchXSphere));
        that.setGrabberStretchYVisible(!activeTool || isActiveTool(grabberStretchYSphere));
        that.setGrabberStretchZVisible(!activeTool || isActiveTool(grabberStretchZSphere));
        that.setGrabberScaleVisible(!activeTool || isActiveTool(grabberScaleLBNCube) || isActiveTool(grabberScaleRBNCube) || isActiveTool(grabberScaleLBFCube) || isActiveTool(grabberScaleRBFCube)
                                                || isActiveTool(grabberScaleLTNCube) || isActiveTool(grabberScaleRTNCube) || isActiveTool(grabberScaleLTFCube) || isActiveTool(grabberScaleRTFCube)
                                                || isActiveTool(grabberStretchXSphere) || isActiveTool(grabberStretchYSphere) || isActiveTool(grabberStretchZSphere));
        //keep cloner always hidden for now since you can hold Alt to clone while dragging to translate  - we may bring cloner back for HMD only later
        //that.setGrabberClonerVisible(!activeTool || isActiveTool(grabberCloner));

        if (wantDebug) {
            print("====== Update Grabbers <=======");
        }
    };
    Script.update.connect(that.updateGrabbers);

    that.updateActiveRotateRing = function() {
        var activeRotateRing = null;
        if (isActiveTool(grabberRotatePitchRing)) {
            activeRotateRing = grabberRotatePitchRing;
        } else if (isActiveTool(grabberRotateYawRing)) {
            activeRotateRing = grabberRotateYawRing;
        } else if (isActiveTool(grabberRotateRollRing)) {
            activeRotateRing = grabberRotateRollRing;
        }
        if (activeRotateRing != null) {
            var tickMarksAngle =  ctrlPressed ? ROTATION_CTRL_SNAP_ANGLE : ROTATION_DEFAULT_TICK_MARKS_ANGLE;
            Overlays.editOverlay(activeRotateRing, { majorTickMarksAngle: tickMarksAngle });
        }
    };

    // FUNCTION: SET OVERLAYS VISIBLE
    that.setOverlaysVisible = function(isVisible) {
        for (var i = 0; i < allOverlays.length; i++) {
            Overlays.editOverlay(allOverlays[i], { visible: isVisible });
        }
    };

    // FUNCTION: SET GRABBER TRANSLATE VISIBLE
    that.setGrabberTranslateVisible = function(isVisible) {
        that.setGrabberTranslateXVisible(isVisible);
        that.setGrabberTranslateYVisible(isVisible);
        that.setGrabberTranslateZVisible(isVisible);
    };

    that.setGrabberTranslateXVisible = function(isVisible) {
        Overlays.editOverlay(grabberTranslateXCone, { visible: isVisible });
        Overlays.editOverlay(grabberTranslateXCylinder, { visible: isVisible });
    };

    that.setGrabberTranslateYVisible = function(isVisible) {
        Overlays.editOverlay(grabberTranslateYCone, { visible: isVisible });
        Overlays.editOverlay(grabberTranslateYCylinder, { visible: isVisible });
    };

    that.setGrabberTranslateZVisible = function(isVisible) {
        Overlays.editOverlay(grabberTranslateZCone, { visible: isVisible });
        Overlays.editOverlay(grabberTranslateZCylinder, { visible: isVisible });
    };

    // FUNCTION: SET GRABBER ROTATE VISIBLE
    that.setGrabberRotateVisible = function(isVisible) {
        that.setGrabberRotatePitchVisible(isVisible);
        that.setGrabberRotateYawVisible(isVisible);
        that.setGrabberRotateRollVisible(isVisible);
    };

    that.setGrabberRotatePitchVisible = function(isVisible) {
        Overlays.editOverlay(grabberRotatePitchRing, { visible: isVisible });
    };

    that.setGrabberRotateYawVisible = function(isVisible) {
        Overlays.editOverlay(grabberRotateYawRing, { visible: isVisible });
    };

    that.setGrabberRotateRollVisible = function(isVisible) {
        Overlays.editOverlay(grabberRotateRollRing, { visible: isVisible });
    };

    // FUNCTION: SET GRABBER STRETCH VISIBLE
    that.setGrabberStretchVisible = function(isVisible) {
        that.setGrabberStretchXVisible(isVisible);
        that.setGrabberStretchYVisible(isVisible);
        that.setGrabberStretchZVisible(isVisible);
    };

    that.setGrabberStretchXVisible = function(isVisible) {
        Overlays.editOverlay(grabberStretchXSphere, { visible: isVisible });
    };

    that.setGrabberStretchYVisible = function(isVisible) {
        Overlays.editOverlay(grabberStretchYSphere, { visible: isVisible });
    };

    that.setGrabberStretchZVisible = function(isVisible) {
        Overlays.editOverlay(grabberStretchZSphere, { visible: isVisible });
    };
    
    // FUNCTION: SET GRABBER SCALE VISIBLE
    that.setGrabberScaleVisible = function(isVisible) {
        Overlays.editOverlay(grabberScaleLBNCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleRBNCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleLBFCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleRBFCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleLTNCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleRTNCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleLTFCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleRTFCube, { visible: isVisible });
        Overlays.editOverlay(grabberScaleTREdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleTLEdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleTFEdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleTNEdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleBREdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleBLEdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleBFEdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleBNEdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleNREdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleNLEdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleFREdge, { visible: isVisible });
        Overlays.editOverlay(grabberScaleFLEdge, { visible: isVisible });
    };

    // FUNCTION: SET GRABBER CLONER VISIBLE
    that.setGrabberClonerVisible = function(isVisible) {
        Overlays.editOverlay(grabberCloner, { visible: isVisible });
    };

    var initialXZPick = null;
    var isConstrained = false;
    var constrainMajorOnly = false;
    var startPosition = null;
    var duplicatedEntityIDs = null;

    // TOOL DEFINITION: TRANSLATE XZ TOOL
    var translateXZTool = addGrabberTool(selectionBox, {
        mode: 'TRANSLATE_XZ',
        pickPlanePosition: { x: 0, y: 0, z: 0 },
        greatestDimension: 0.0,
        startingDistance: 0.0,
        startingElevation: 0.0,
        onBegin: function(event, pickRay, pickResult, doClone) {
            var wantDebug = false;
            if (wantDebug) {
                print("================== TRANSLATE_XZ(Beg) -> =======================");
                Vec3.print("    pickRay", pickRay);
                Vec3.print("    pickRay.origin", pickRay.origin);
                Vec3.print("    pickResult.intersection", pickResult.intersection);
            }

            SelectionManager.saveProperties();
            that.resetPreviousHandleColor();

            that.setGrabberTranslateVisible(false);
            that.setGrabberRotateVisible(false);
            that.setGrabberScaleVisible(false);
            that.setGrabberStretchVisible(false);
            that.setGrabberClonerVisible(false);

            startPosition = SelectionManager.worldPosition;

            translateXZTool.pickPlanePosition = pickResult.intersection;
            translateXZTool.greatestDimension = Math.max(Math.max(SelectionManager.worldDimensions.x, SelectionManager.worldDimensions.y), SelectionManager.worldDimensions.z);
            translateXZTool.startingDistance = Vec3.distance(pickRay.origin, SelectionManager.position);
            translateXZTool.startingElevation = translateXZTool.elevation(pickRay.origin, translateXZTool.pickPlanePosition);
            if (wantDebug) {
                print("    longest dimension: " + translateXZTool.greatestDimension);
                print("    starting distance: " + translateXZTool.startingDistance);
                print("    starting elevation: " + translateXZTool.startingElevation);
            }

            initialXZPick = rayPlaneIntersection(pickRay, translateXZTool.pickPlanePosition, {
                x: 0,
                y: 1,
                z: 0
            });

            // Duplicate entities if alt is pressed.  This will make a
            // copy of the selected entities and move the _original_ entities, not
            // the new ones.
            if (event.isAlt || doClone) {
                duplicatedEntityIDs = [];
                for (var otherEntityID in SelectionManager.savedProperties) {
                    var properties = SelectionManager.savedProperties[otherEntityID];
                    if (!properties.locked) {
                        var entityID = Entities.addEntity(properties);
                        duplicatedEntityIDs.push({
                            entityID: entityID,
                            properties: properties
                        });
                    }
                }
            } else {
                duplicatedEntityIDs = null;
            }

            isConstrained = false;
            if (wantDebug) {
                print("================== TRANSLATE_XZ(End) <- =======================");
            }
        },
        onEnd: function(event, reason) {
            pushCommandForSelections(duplicatedEntityIDs);
        },
        elevation: function(origin, intersection) {
            return (origin.y - intersection.y) / Vec3.distance(origin, intersection);
        },
        onMove: function(event) {
            var wantDebug = false;
            pickRay = generalComputePickRay(event.x, event.y);

            var pick = rayPlaneIntersection2(pickRay, translateXZTool.pickPlanePosition, {
                x: 0,
                y: 1,
                z: 0
            });

            // If the pick ray doesn't hit the pick plane in this direction, do nothing.
            // this will happen when someone drags across the horizon from the side they started on.
            if (!pick) {
                if (wantDebug) {
                    print("    "+ translateXZTool.mode + "Pick ray does not intersect XZ plane.");
                }
                
                // EARLY EXIT--(Invalid ray detected.)
                return;
            }

            var vector = Vec3.subtract(pick, initialXZPick);

            // If the mouse is too close to the horizon of the pick plane, stop moving
            var MIN_ELEVATION = 0.02; //  largest dimension of object divided by distance to it
            var elevation = translateXZTool.elevation(pickRay.origin, pick);
            if (wantDebug) {
                print("Start Elevation: " + translateXZTool.startingElevation + ", elevation: " + elevation);
            }
            if ((translateXZTool.startingElevation > 0.0 && elevation < MIN_ELEVATION) ||
                (translateXZTool.startingElevation < 0.0 && elevation > -MIN_ELEVATION)) {
                if (wantDebug) {
                    print("    "+ translateXZTool.mode + " - too close to horizon!");
                }

                // EARLY EXIT--(Don't proceed past the reached limit.)
                return;
            }

            //  If the angular size of the object is too small, stop moving
            var MIN_ANGULAR_SIZE = 0.01; //  Radians
            if (translateXZTool.greatestDimension > 0) {
                var angularSize = Math.atan(translateXZTool.greatestDimension / Vec3.distance(pickRay.origin, pick));
                if (wantDebug) {
                    print("Angular size = " + angularSize);
                }
                if (angularSize < MIN_ANGULAR_SIZE) {
                    return;
                }
            }

            // If shifted, constrain to one axis
            if (event.isShifted) {
                if (Math.abs(vector.x) > Math.abs(vector.z)) {
                    vector.z = 0;
                } else {
                    vector.x = 0;
                }
                if (!isConstrained) {
                    isConstrained = true;
                }
            } else {
                if (isConstrained) {
                    isConstrained = false;
                }
            }

            constrainMajorOnly = event.isControl;
            var cornerPosition = Vec3.sum(startPosition, Vec3.multiply(-0.5, SelectionManager.worldDimensions));
            vector = Vec3.subtract(
                grid.snapToGrid(Vec3.sum(cornerPosition, vector), constrainMajorOnly),
                cornerPosition);


            for (var i = 0; i < SelectionManager.selections.length; i++) {
                var properties = SelectionManager.savedProperties[SelectionManager.selections[i]];
                if (!properties) {
                    continue;
                }
                var newPosition = Vec3.sum(properties.position, {
                    x: vector.x,
                    y: 0,
                    z: vector.z
                });
                Entities.editEntity(SelectionManager.selections[i], {
                    position: newPosition
                });

                if (wantDebug) {
                    print("translateXZ... ");
                    Vec3.print("                 vector:", vector);
                    Vec3.print("            newPosition:", properties.position);
                    Vec3.print("            newPosition:", newPosition);
                }
            }

            SelectionManager._update();
        }
    });

    addGrabberTranslateTool(grabberTranslateXCone, "TRANSLATE_X", TRANSLATE_DIRECTION.X);
    addGrabberTranslateTool(grabberTranslateXCylinder, "TRANSLATE_X", TRANSLATE_DIRECTION.X);
    addGrabberTranslateTool(grabberTranslateYCone, "TRANSLATE_Y", TRANSLATE_DIRECTION.Y);
    addGrabberTranslateTool(grabberTranslateYCylinder, "TRANSLATE_Y", TRANSLATE_DIRECTION.Y);
    addGrabberTranslateTool(grabberTranslateZCone, "TRANSLATE_Z", TRANSLATE_DIRECTION.Z);
    addGrabberTranslateTool(grabberTranslateZCylinder, "TRANSLATE_Z", TRANSLATE_DIRECTION.Z);

    addGrabberRotateTool(grabberRotatePitchRing, "ROTATE_PITCH", ROTATE_DIRECTION.PITCH);
    addGrabberRotateTool(grabberRotateYawRing, "ROTATE_YAW", ROTATE_DIRECTION.YAW);
    addGrabberRotateTool(grabberRotateRollRing, "ROTATE_ROLL", ROTATE_DIRECTION.ROLL);

    addGrabberStretchTool(grabberStretchXSphere, "STRETCH_X", STRETCH_DIRECTION.X);
    addGrabberStretchTool(grabberStretchYSphere, "STRETCH_Y", STRETCH_DIRECTION.Y);
    addGrabberStretchTool(grabberStretchZSphere, "STRETCH_Z", STRETCH_DIRECTION.Z);

    addGrabberScaleTool(grabberScaleLBNCube, "SCALE_LBN", SCALE_DIRECTION.LBN);
    addGrabberScaleTool(grabberScaleRBNCube, "SCALE_RBN", SCALE_DIRECTION.RBN);
    addGrabberScaleTool(grabberScaleLBFCube, "SCALE_LBF", SCALE_DIRECTION.LBF);
    addGrabberScaleTool(grabberScaleRBFCube, "SCALE_RBF", SCALE_DIRECTION.RBF);
    addGrabberScaleTool(grabberScaleLTNCube, "SCALE_LTN", SCALE_DIRECTION.LTN);
    addGrabberScaleTool(grabberScaleRTNCube, "SCALE_RTN", SCALE_DIRECTION.RTN);
    addGrabberScaleTool(grabberScaleLTFCube, "SCALE_LTF", SCALE_DIRECTION.LTF);
    addGrabberScaleTool(grabberScaleRTFCube, "SCALE_RTF", SCALE_DIRECTION.RTF);

    // GRABBER TOOL: GRABBER CLONER
    addGrabberTool(grabberCloner, {
        mode: "CLONE",
        onBegin: function(event, pickRay, pickResult) {
            var doClone = true;
            translateXZTool.onBegin(event,pickRay,pickResult,doClone);
        },
        elevation: function (event) {
            translateXZTool.elevation(event);
        },
    
        onEnd: function (event) {
            translateXZTool.onEnd(event);
        },
    
        onMove: function (event) {
            translateXZTool.onMove(event);
        }
    });

    // FUNCTION: CHECK MOVE
    that.checkMove = function() {
    };

    that.checkControllerMove = function() {
        if (SelectionManager.hasSelection()) {
            var controllerPose = getControllerWorldLocation(activeHand, true);
            var hand = (activeHand === Controller.Standard.LeftHand) ? 0 : 1;
            if (controllerPose.valid && lastControllerPoses[hand].valid) {
                if (!Vec3.equal(controllerPose.position, lastControllerPoses[hand].position) ||
                    !Vec3.equal(controllerPose.rotation, lastControllerPoses[hand].rotation)) {
                    that.mouseMoveEvent({});
                }
            }
            lastControllerPoses[hand] = controllerPose;
        }
    };

    // FUNCTION DEF(s): Intersection Check Helpers
    function testRayIntersect(queryRay, overlayIncludes, overlayExcludes) {
        var wantDebug = false;
        if ((queryRay === undefined) || (queryRay === null)) {
            if (wantDebug) {
                print("testRayIntersect - EARLY EXIT -> queryRay is undefined OR null!");
            }
            return null;
        }

        var intersectObj = Overlays.findRayIntersection(queryRay, true, overlayIncludes, overlayExcludes);

        if (wantDebug) {
            if (!overlayIncludes) {
                print("testRayIntersect - no overlayIncludes provided.");
            }
            if (!overlayExcludes) {
                print("testRayIntersect - no overlayExcludes provided.");
            }
            print("testRayIntersect - Hit: " + intersectObj.intersects);
            print("    intersectObj.overlayID:" + intersectObj.overlayID + "[" + overlayNames[intersectObj.overlayID] + "]");
            print("        OverlayName: " + overlayNames[intersectObj.overlayID]);
            print("    intersectObj.distance:" + intersectObj.distance);
            print("    intersectObj.face:" + intersectObj.face);
            Vec3.print("    intersectObj.intersection:", intersectObj.intersection);
        }

        return intersectObj;
    }

    // FUNCTION: MOUSE PRESS EVENT
    that.mousePressEvent = function (event) {
        var wantDebug = false;
        if (wantDebug) {
            print("=============== eST::MousePressEvent BEG =======================");
        }
        if (!event.isLeftButton && !that.triggered) {
            // EARLY EXIT-(if another mouse button than left is pressed ignore it)
            return false;
        }

        var pickRay = generalComputePickRay(event.x, event.y);
        // TODO_Case6491:  Move this out to setup just to make it once
        var interactiveOverlays = [HMD.tabletID, HMD.tabletScreenID, HMD.homeButtonID];
        for (var key in grabberTools) {
            if (grabberTools.hasOwnProperty(key)) {
                interactiveOverlays.push(key);
            }
        }

        // Start with unknown mode, in case no tool can handle this.
        activeTool = null;

        var results = testRayIntersect(pickRay, interactiveOverlays);
        if (results.intersects) {
            var hitOverlayID = results.overlayID;
            if ((hitOverlayID === HMD.tabletID) || (hitOverlayID === HMD.tabletScreenID) || (hitOverlayID === HMD.homeButtonID)) {
                // EARLY EXIT-(mouse clicks on the tablet should override the edit affordances)
                return false;
            }

            entityIconOverlayManager.setIconsSelectable(SelectionManager.selections, true);

            var hitTool = grabberTools[ hitOverlayID ];
            if (hitTool) {
                activeTool = hitTool;
                if (activeTool.onBegin) {
                    activeTool.onBegin(event, pickRay, results);
                } else {
                    print("ERROR: entitySelectionTool.mousePressEvent - ActiveTool(" + activeTool.mode + ") missing onBegin");
                }
            } else {
                print("ERROR: entitySelectionTool.mousePressEvent - Hit unexpected object, check interactiveOverlays");
            }// End_if (hitTool)
        }// End_If(results.intersects)

        if (wantDebug) {
            print("    DisplayMode: " + getMode());
            print("=============== eST::MousePressEvent END =======================");
        }

        // If mode is known then we successfully handled this;
        // otherwise, we're missing a tool.
        return activeTool;
    };

    that.resetPreviousHandleColor = function() {
        if (previousHandle != null) {
            Overlays.editOverlay(previousHandle, { color: previousHandleColor });
            previousHandle = null;
        }
        if (previousHandleHelper != null) {
            Overlays.editOverlay(previousHandleHelper, { color: previousHandleColor });
            previousHandleHelper = null;
        }
    };

    that.getHandleHelper = function(overlay) {
        if (overlay === grabberTranslateXCone) {
            return grabberTranslateXCylinder;
        } else if (overlay === grabberTranslateXCylinder) {
            return grabberTranslateXCone;
        } else if (overlay === grabberTranslateYCone) {
            return grabberTranslateYCylinder;
        } else if (overlay === grabberTranslateYCylinder) {
            return grabberTranslateYCone;
        } else if (overlay === grabberTranslateZCone) {
            return grabberTranslateZCylinder;
        } else if (overlay === grabberTranslateZCylinder) {
            return grabberTranslateZCone;
        }
    };

    // FUNCTION: MOUSE MOVE EVENT
    that.mouseMoveEvent = function(event) {
        var wantDebug = false;
        if (wantDebug) {
            print("=============== eST::MouseMoveEvent BEG =======================");
        }
        if (activeTool) {
            if (wantDebug) {
                print("    Trigger ActiveTool(" + activeTool.mode + ")'s onMove");
            }
            activeTool.onMove(event);

            if (wantDebug) {
                print("    Trigger SelectionManager::update");
            }
            SelectionManager._update();

            if (wantDebug) {
                print("=============== eST::MouseMoveEvent END =======================");
            }
            // EARLY EXIT--(Move handled via active tool)
            return true;
        }

        // if no tool is active, then just look for handles to highlight...
        var pickRay = generalComputePickRay(event.x, event.y);
        var result = Overlays.findRayIntersection(pickRay);
        var pickedColor;
        var highlightNeeded = false;

        if (result.intersects) {
            switch (result.overlayID) {
                case grabberTranslateXCone:
                case grabberTranslateXCylinder:
                case grabberRotatePitchRing:
                case grabberStretchXSphere:
                    pickedColor = COLOR_RED;
                    highlightNeeded = true;
                    break;
                case grabberTranslateYCone:
                case grabberTranslateYCylinder:
                case grabberRotateYawRing:
                case grabberStretchYSphere:
                    pickedColor = COLOR_GREEN;
                    highlightNeeded = true;
                    break;
                case grabberTranslateZCone:
                case grabberTranslateZCylinder:
                case grabberRotateRollRing:
                case grabberStretchZSphere:
                    pickedColor = COLOR_BLUE;
                    highlightNeeded = true;
                    break;
                case grabberScaleLBNCube:
                case grabberScaleRBNCube:
                case grabberScaleLBFCube:
                case grabberScaleRBFCube:
                case grabberScaleLTNCube:
                case grabberScaleRTNCube:
                case grabberScaleLTFCube:
                case grabberScaleRTFCube:
                    pickedColor = GRABBER_SCALE_CUBE_IDLE_COLOR;
                    highlightNeeded = true;
                    break;
                default:
                    that.resetPreviousHandleColor();
                    break;
            }

            if (highlightNeeded) {
                that.resetPreviousHandleColor();
                Overlays.editOverlay(result.overlayID, { color: GRABBER_HOVER_COLOR });
                previousHandle = result.overlayID;
                previousHandleHelper = that.getHandleHelper(result.overlayID);
                if (previousHandleHelper != null) {
                    Overlays.editOverlay(previousHandleHelper, { color: GRABBER_HOVER_COLOR });
                }
                previousHandleColor = pickedColor;
            }

        } else {
            that.resetPreviousHandleColor();
        }

        if (wantDebug) {
            print("=============== eST::MouseMoveEvent END =======================");
        }
        return false;
    };

    // FUNCTION: MOUSE RELEASE EVENT
    that.mouseReleaseEvent = function(event) {
        var wantDebug = false;
        if (wantDebug) {
            print("=============== eST::MouseReleaseEvent BEG =======================");
        }
        var showHandles = false;
        if (activeTool) {
            if (activeTool.onEnd) {
                if (wantDebug) {
                    print("    Triggering ActiveTool(" + activeTool.mode + ")'s onEnd");
                }
                activeTool.onEnd(event);
            } else if (wantDebug) {
                print("    ActiveTool(" + activeTool.mode + ")'s missing onEnd");
            }
        }

        showHandles = activeTool; // base on prior tool value
        activeTool = null;

        // if something is selected, then reset the "original" properties for any potential next click+move operation
        if (SelectionManager.hasSelection()) {
            if (showHandles) {
                if (wantDebug) {
                    print("    Triggering that.select");
                }
                that.select(SelectionManager.selections[0], event);
            }
        }

        if (wantDebug) {
            print("=============== eST::MouseReleaseEvent END =======================");
        }
    };

    // NOTE: mousePressEvent and mouseMoveEvent from the main script should call us., so we don't hook these:
    //       Controller.mousePressEvent.connect(that.mousePressEvent);
    //       Controller.mouseMoveEvent.connect(that.mouseMoveEvent);
    Controller.mouseReleaseEvent.connect(that.mouseReleaseEvent);

    return that;
}());
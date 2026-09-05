"""
IBVAP - Intelligent Border Video Analytics Platform
Module: reid/embed.py
Description: Feature extraction engine for person and vehicle re-identification.
             Extracts normalized 512-dim visual embeddings using a lightweight
             pretrained ResNet18/OSNet backbone, fully runnable on CPU and GPU.
"""

from typing import List, Optional, Tuple, Union
import cv2
import numpy as np
import torch
import torch.nn as nn
import torchvision.models as models
import torchvision.transforms as transforms


class FeatureExtractor:
    """
    Lightweight feature extractor that transforms image crops (persons/vehicles)
    into 512-dimensional L2-normalized feature vectors.
    """

    def __init__(
        self,
        model_name: str = "resnet18",
        device: Optional[str] = None,
        input_size: Tuple[int, int] = (256, 128),  # Standard Re-ID input (height, width)
    ):
        """
        Args:
            model_name: Backbone architecture ('resnet18', 'resnet34', or 'resnet50').
            device: 'cpu', 'cuda', or None for auto-detection.
            input_size: Target (height, width) for cropped bounding boxes.
        """
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        print(f"[IBVAP Re-ID] Initializing {model_name} feature extractor on {self.device}...")
        self.input_size = input_size

        # Preprocessing transform matching standard ImageNet normalization
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize(self.input_size),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

        # Initialize pretrained backbone
        if model_name == "resnet18":
            base_model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
            # Remove the final classification layer (fc), keeping average pooling output
            self.model = nn.Sequential(*list(base_model.children())[:-1])
            self.feature_dim = 512
        elif model_name == "resnet34":
            base_model = models.resnet34(weights=models.ResNet34_Weights.DEFAULT)
            self.model = nn.Sequential(*list(base_model.children())[:-1])
            self.feature_dim = 512
        elif model_name == "resnet50":
            base_model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
            self.model = nn.Sequential(*list(base_model.children())[:-1])
            self.feature_dim = 2048
        else:
            raise ValueError(f"Unsupported model architecture: {model_name}")

        self.model.to(self.device)
        self.model.eval()

    @torch.no_grad()
    def extract_crop(self, crop_bgr: np.ndarray) -> Optional[np.ndarray]:
        """
        Extracts an L2-normalized embedding from a single BGR image crop.

        Args:
            crop_bgr: OpenCV BGR image crop of a detected person or vehicle.

        Returns:
            1D numpy array of shape (feature_dim,), or None if crop is invalid.
        """
        if crop_bgr is None or crop_bgr.size == 0 or crop_bgr.shape[0] < 10 or crop_bgr.shape[1] < 10:
            return None

        # Convert BGR to RGB
        crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        tensor = self.transform(crop_rgb).unsqueeze(0).to(self.device)

        # Forward pass
        feat = self.model(tensor)
        feat = feat.view(feat.size(0), -1)  # Flatten

        # L2 normalization for cosine similarity
        feat = nn.functional.normalize(feat, p=2, dim=1)
        return feat.cpu().numpy().squeeze(0)

    @torch.no_grad()
    def extract_crops_batch(self, crops_bgr: List[np.ndarray]) -> List[Optional[np.ndarray]]:
        """
        Extracts L2-normalized embeddings for a batch of BGR image crops.

        Args:
            crops_bgr: List of OpenCV BGR image crops.

        Returns:
            List of 1D numpy arrays (or None for invalid crops).
        """
        valid_indices = []
        tensors = []

        for i, crop in enumerate(crops_bgr):
            if crop is not None and crop.size > 0 and crop.shape[0] >= 10 and crop.shape[1] >= 10:
                crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                tensors.append(self.transform(crop_rgb))
                valid_indices.append(i)

        embeddings: List[Optional[np.ndarray]] = [None] * len(crops_bgr)
        if not tensors:
            return embeddings

        batch_tensor = torch.stack(tensors).to(self.device)
        feats = self.model(batch_tensor)
        feats = feats.view(feats.size(0), -1)
        feats = nn.functional.normalize(feats, p=2, dim=1).cpu().numpy()

        for idx, feat in zip(valid_indices, feats):
            embeddings[idx] = feat

        return embeddings

    @staticmethod
    def crop_from_bbox(frame: np.ndarray, bbox: List[float]) -> Optional[np.ndarray]:
        """
        Safely crops an object from a frame using bounding box coordinates [x1, y1, x2, y2].
        """
        h, w = frame.shape[:2]
        x1 = max(0, int(bbox[0]))
        y1 = max(0, int(bbox[1]))
        x2 = min(w, int(bbox[2]))
        y2 = min(h, int(bbox[3]))

        if (x2 - x1) <= 5 or (y2 - y1) <= 5:
            return None

        return frame[y1:y2, x1:x2]
